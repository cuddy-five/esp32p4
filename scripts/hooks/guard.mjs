#!/usr/bin/env node
/**
 * Copilot hooks for this repository. Copilot loads them only in trusted folders.
 *
 *   node scripts/hooks/guard.mjs pre-tool-use   (.github/hooks/tool-policy.json, every session)
 *   node scripts/hooks/guard.mjs stop           (implementer and rust-coder frontmatter)
 *
 * `pre-tool-use` reads the hook payload on stdin and prints a permission
 * decision for the few actions no agent here takes on its own. "ask" prompts
 * the owner in an interactive CLI session; cloud agent and autopilot treat it
 * as "deny". Anything not named goes through the normal permission flow. The
 * rules stop mistakes, not a determined attacker: a shell can reach the same
 * effect in ways no pattern names.
 *
 * `stop` runs the checks for the areas the branch changes (the firmware gate
 * for firmware/, `npm test` for the control plane) and keeps a coding agent
 * from finishing while they fail, at most three times in a row.
 *
 * Every path exits 0: Copilot denies a tool call when a preToolUse hook
 * crashes, so a bug here must not block all work.
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DENY = "deny";
const ASK = "ask";

const SHELL_TOOLS = new Set(["bash", "powershell", "shell", "write_bash", "write_powershell", "execute", "run_in_terminal"]);
const WRITE_TOOLS = new Set(["create", "edit", "str_replace_editor", "apply_patch", "write", "multi_edit"]);

/** Files that hold credentials or keys. No agent reads or writes them. */
export function isSecretPath(p) {
  const norm = String(p).replaceAll("\\", "/").replace(/[)"'`;,]+$/, "");
  const base = norm.split("/").pop().toLowerCase();
  if (/^\.env(\..+)?$/.test(base) && !/^\.env\.(example|sample|template)$/.test(base)) return true;
  if (/\.(pem|key|p12|pfx|jks|keystore)$/.test(base)) return true;
  if (/^id_(rsa|dsa|ecdsa|ed25519)(_sk)?$/.test(base)) return true;
  if (/^(\.netrc|\.authinfo(\.gpg)?|\.git-credentials|\.pgpass|wallet\.dat)$/.test(base) || base.endsWith(".wallet")) return true;
  return /(^|\/)\.copilot\/config\.json$|(^|\/)gh\/hosts\.yml$|(^|\/)chezmoi\/key\.txt$|(^|\/)\.gnupg(\/|$)|^\/proc\/[^/]+\/environ$/.test(norm);
}

/** Guardrails the owner approves (approvals.yaml `control_plane_self`): hooks, check scripts, workflows, policies. */
const GUARDRAILS = [/^\.github\/hooks\//, /^scripts\/hooks\//, /^scripts\/gates\//, /^\.github\/workflows\//,
  /^\.github\/control-plane\/policies\//, /^\.review-domains\.json$/];

export function isGuardrailPath(rel) {
  return GUARDRAILS.some((re) => re.test(rel));
}

/**
 * Split a shell command line into simple commands, each a list of words.
 * Quotes are honored; command substitutions and subshells become separate
 * commands; redirections are words of their own. A heredoc body is data,
 * skipped unless a shell reads it as a script. Approximate by design.
 */
export function simpleCommands(line) {
  const commands = [];
  const pending = [];
  const bodies = [];
  let words = [];
  let word = "";
  let inWord = false;
  let quote = null;
  let expectDelim = null;
  const endWord = () => {
    if (inWord) {
      if (expectDelim) pending.push({ delim: word, strip: expectDelim === "<<-", owner: commands.length });
      expectDelim = null;
      words.push(word);
    }
    word = "";
    inWord = false;
  };
  const endCommand = () => {
    endWord();
    if (words.length) commands.push(words);
    words = [];
  };
  // Read the bodies of the heredocs opened on the line that ends at `at`; return the last index consumed.
  const readBodies = (at) => {
    let pos = at + 1;
    for (const doc of pending) {
      const lines = [];
      while (pos < line.length) {
        const nl = line.indexOf("\n", pos);
        const end = nl === -1 ? line.length : nl;
        const text = line.slice(pos, end);
        pos = end + 1;
        if ((doc.strip ? text.replace(/^\t+/, "") : text) === doc.delim) break;
        lines.push(text);
      }
      bodies.push({ owner: doc.owner, text: lines.join("\n") });
    }
    pending.length = 0;
    return pos - 1;
  };
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === "\\" && quote === '"' && i + 1 < line.length) word += line[++i];
      else word += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      inWord = true;
    } else if (ch === "\\" && i + 1 < line.length) {
      word += line[++i];
      inWord = true;
    } else if (ch === "\n") {
      endCommand();
      if (pending.length) i = readBodies(i);
    } else if (ch === "<" && line[i + 1] === "<" && line[i + 2] !== "<") {
      endWord();
      i++;
      const op = line[i + 1] === "-" ? (i++, "<<-") : "<<";
      words.push(op);
      expectDelim = op;
    } else if (/\s/.test(ch)) {
      endWord();
    } else if (";&|()`".includes(ch)) {
      endCommand();
    } else if (ch === "$" && line[i + 1] === "(") {
      endCommand();
      i++;
    } else if (ch === "<" || ch === ">") {
      endWord();
      let op = ch;
      while (line[i + 1] === ">" || line[i + 1] === "&" || line[i + 1] === "|") op += line[++i];
      words.push(op);
    } else {
      word += ch;
      inWord = true;
    }
  }
  endCommand();
  for (const { owner, text } of bodies) {
    const head = (commands[owner] ?? []).find((w) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) ?? "";
    if (SHELLS.has(path.basename(head))) commands.push(...simpleCommands(text));
  }
  return commands;
}

const PREFIXES = new Set(["env", "sudo", "doas", "time", "nice", "nohup", "command", "exec", "stdbuf", "xargs", "timeout", "unbuffer", "flatpak-spawn"]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "fish", "ksh"]);

/** Expand one simple command into the commands it runs: wrappers dropped, `sh -c` and `eval` text split again. */
function expand(words, depth = 0) {
  let w = words.filter((x) => !/^[<>]/.test(x));
  const via = new Set();
  for (;;) {
    while (w.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0]) || w[0] === "{" || w[0] === "!")) w.shift();
    if (w.length >= 2 && path.basename(w[0]) === "distrobox" && w[1] === "enter") {
      const dash = w.indexOf("--");
      w = dash === -1 ? [] : w.slice(dash + 1);
      continue;
    }
    if (!w.length || !PREFIXES.has(path.basename(w[0]))) break;
    via.add(path.basename(w.shift()));
    while (w.length && w[0].startsWith("-")) w.shift();
    if (via.has("timeout") && w.length && /^\d/.test(w[0])) w.shift();
  }
  const out = [{ prog: w.length ? path.basename(w[0]) : "", args: w.slice(1), words, via }];
  if (depth < 3 && SHELLS.has(out[0].prog)) {
    const c = out[0].args.indexOf("-c");
    if (c !== -1 && out[0].args[c + 1]) for (const sub of simpleCommands(out[0].args[c + 1])) out.push(...expand(sub, depth + 1));
  }
  if (depth < 3 && out[0].prog === "eval") for (const sub of simpleCommands(out[0].args.join(" "))) out.push(...expand(sub, depth + 1));
  return out;
}

/**
 * Words that may name a file, for the secret check: whole words without
 * spaces, minus message and body texts and what `echo` or `printf` print
 * (their redirection targets still count). `--file=.env` yields `.env`.
 */
function fileWords(prog, words) {
  const text = /^(-m|--message|-b|--body|--title|-t|--notes|--subject)$/;
  return words
    .filter((w, i) => !text.test(words[i - 1] ?? "") && ((prog !== "echo" && prog !== "printf") || /^[<>]/.test(words[i - 1] ?? "")))
    .flatMap((w) => w.split(/[=,]/))
    .filter((p) => p && !/\s/.test(p) && (p.includes("/") || p.startsWith(".") || p.startsWith("~")));
}

const has = (args, ...flags) => args.some((a) => flags.includes(a) || flags.some((f) => f.startsWith("--") && a.startsWith(`${f}=`)));
const APPROVE_LINE = /(^|\n|=)[ \t]*\/(approve|resume)\b/;
const APPROVE_IN_JSON = /(^|\n|=|")[ \t]*\/(approve|resume)\b/;
const SECRET_NAME = /TOKEN|SECRET|PASSWORD|PASSPHRASE|API_KEY|PRIVATE_KEY|CREDENTIAL/i;

function readSmall(file, cwd) {
  try {
    const full = path.resolve(cwd, file.replace(/^@/, ""));
    return fs.statSync(full).size < 1_000_000 ? fs.readFileSync(full, "utf8") : "";
  } catch {
    return "";
  }
}

/** Git's subcommand and its arguments, past global options such as `-C <dir>`. */
function gitArgs(args) {
  const out = [...args];
  let dir = null;
  while (out.length && out[0].startsWith("-")) {
    const opt = out.shift();
    if (opt === "-C") dir = out.shift() ?? null;
    else if (opt === "-c" || opt === "--git-dir" || opt === "--work-tree" || opt === "--namespace") out.shift();
  }
  return { sub: out[0] ?? "", rest: out.slice(1), dir };
}

function currentBranch(dir) {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }).trim();
  } catch {
    return "";
  }
}

const MAIN = /^(\+?)(refs\/heads\/)?(main|master)$/;
const EFUSE_WRITE = /^(burn[_-]\w+|write[_-]protect[_-]efuse|read[_-]protect[_-]efuse|write[_-]efuse)$/;
const BITCOIN_SECRET_RPC = /^(dumpprivkey|dumpwallet|importprivkey|importwallet|sethdseed|walletpassphrase|walletpassphrasechange|encryptwallet|backupwallet|listdescriptors|sendtoaddress|sendmany|send|sendall|walletcreatefundedpsbt|signrawtransactionwithwallet|walletprocesspsbt)$/;

const REASONS = {
  efuse: "eFuse writes are permanent: they can brick the board or lock out flashing and debugging. Only the owner burns eFuses, by hand, from a reviewed procedure.",
  flash: "Writing, erasing or running code on the board is the owner's call; a passing check grants no flash authority (docs/runbooks/wallet-development.md). In an interactive session the owner can allow it once.",
  secret: "That would expose a credential or key in the transcript, which is logged and may be published. Use the tool that needs the credential; never read or print it.",
  approve: "Only the overseer writes /approve or /resume (AGENTS.md, non-negotiable 4). A comment posted with the owner's login counts as the owner's own approval, so no agent may post one.",
  merge: "Merging is the owner's decision at the reviewed commit; agents never merge or approve pull requests.",
  force: "A force push rewrites published history and can destroy reviewed commits. Push new commits instead.",
  main: "main changes only through a reviewed pull request: push a feature branch and open or update its pull request.",
  remoteDelete: "Deleting a remote branch can lose unmerged work; ask the owner first.",
  settings: "Repository settings, rulesets, secrets and workflow switches are the owner's. `settings apply` runs only on their explicit request.",
  workflowRun: "Starting a workflow spends Actions minutes and can start agents; ask the owner first.",
  discard: "This discards uncommitted or unmerged work, possibly another session's. Commit it, or ask the owner first.",
  install: "Installing or upgrading tools changes the machine and needs the owner's reviewed plan (docs/runbooks/wallet-development.md). Report the missing tool instead.",
  dependency: "Adding, removing or upgrading a dependency needs a human review (approvals.yaml `supply_chain`). Propose it in the plan or handoff.",
  paid: "Starting another Copilot session spends the owner's AI credits; ask the owner first.",
  node: "Starting a Bitcoin node, or talking to one outside regtest, is the owner's call; use a scratch regtest node they approve.",
  wallet: "That RPC reveals keys or spends from a real wallet. Agents use regtest test coins only.",
  guardrail: "This file is a guardrail the owner approves (approvals.yaml `control_plane_self`). Change it only when the task names it; the owner reviews the change.",
};

/** The strongest decision a single expanded command earns, with its reason, or null. */
function commandDecision({ prog, args, words, via }, ctx) {
  const deny = (key) => ({ decision: DENY, reason: REASONS[key] });
  const ask = (key) => ({ decision: ASK, reason: REASONS[key] });

  if (fileWords(prog, words).some(isSecretPath)) return deny("secret");
  // A bare `env`, `printenv`, `set` or `export` prints every variable, tokens included.
  const plain = words.filter((x, i) => !/^[<>]/.test(x) && !/^[<>]/.test(words[i - 1] ?? ""));
  if (/^(env|printenv|set|export)$/.test(path.basename(plain[0] ?? "")) && plain.slice(1).every((a) => a.startsWith("-"))) return deny("secret");
  if (prog === "printenv" && args.some((a) => SECRET_NAME.test(a))) return deny("secret");
  // `$GH_TOKEN` and the like expand to the secret itself, wherever the command sends it.
  const textArg = (i) => /^(-m|--message|-b|--body|--title)$/.test(words[i - 1] ?? "");
  if (words.some((w, i) => !textArg(i) && [...w.matchAll(/\$\{?([A-Za-z_][A-Za-z0-9_]*)/g)].some((m) => SECRET_NAME.test(m[1])))) return deny("secret");

  const espModule = /^python3?$/.test(prog) && args[0] === "-m" && /^(esptool|espefuse)$/.test(args[1] ?? "");
  const espTool = /^(esptool(\.py)?|espefuse(\.py)?|espflash)$/.test(prog) || espModule;
  if (espTool && args.some((a) => EFUSE_WRITE.test(a))) return deny("efuse");
  if (prog === "espflash" && /^(flash|write-bin|erase-flash|erase-region|erase-parts)$/.test(args[0] ?? "")) return ask("flash");
  if ((/^esptool(\.py)?$/.test(prog) || espModule) && args.some((a) => /^(write[_-]flash|erase[_-]flash|erase[_-]region|load[_-]ram|write[_-]mem)$/.test(a))) return ask("flash");
  if (prog === "cargo" && args[0] === "espflash" && /^(flash|write-bin|erase-flash|erase-region|erase-parts)$/.test(args[1] ?? "")) return ask("flash");
  if (prog === "probe-rs" && /^(run|download|erase|attach)$/.test(args[0] ?? "")) return ask("flash");
  if (prog === "openocd") return ask("flash");

  if (prog === "gh") {
    const [area, verb] = args;
    if (area === "auth" && (verb === "token" || has(args, "-t", "--show-token"))) return deny("secret");
    // The gate reads approvals from comments and reviews, not from pull request bodies.
    const comments = ((area === "pr" || area === "issue") && (verb === "comment" || verb === "review")) || (area === "api" && args.some((a) => /comments|reviews/.test(a)));
    if (comments) {
      const files = args.flatMap((a, i) => (["--body-file", "-F", "--input"].includes(args[i - 1]) ? [a.replace(/^body=/, "")] : /^body=@/.test(a) ? [a.slice(5)] : []));
      if (args.some((a) => APPROVE_LINE.test(a)) || files.some((f) => APPROVE_LINE.test(readSmall(f, ctx.cwd)))) return deny("approve");
    }
    if (area === "pr" && verb === "merge") return deny("merge");
    if (area === "pr" && verb === "review" && has(args, "--approve", "-a")) return deny("merge");
    if (area === "api" && args.some((a) => /\/pulls\/\d+\/merge\b|\/merges\b/.test(a))) return deny("merge");
    if (area === "repo" && /^(edit|delete|rename|archive|unarchive)$/.test(verb ?? "")) return deny("settings");
    if (area === "secret" || (area === "variable" && verb !== "list" && verb !== "get")) return deny("settings");
    if (area === "workflow" && (verb === "enable" || verb === "disable")) return deny("settings");
    if (area === "workflow" && verb === "run") return ask("workflowRun");
    if (area === "run" && (verb === "rerun" || verb === "cancel" || verb === "delete")) return ask("workflowRun");
    if (area === "api") {
      const method = (args[args.findIndex((a) => a === "-X" || a === "--method") + 1] ?? args.find((a) => a.startsWith("--method="))?.slice(9) ?? "").toUpperCase();
      if (/^(PUT|PATCH|DELETE|POST)$/.test(method) && args.some((a) => /rulesets|branches\/[^/]+\/protection|actions\/permissions|collaborators|\/hooks\b|\/keys\b|environments|\/secrets|\/variables/.test(a))) return deny("settings");
    }
    if (area === "copilot" || (area === "agent-task" && verb === "create")) return ask("paid");
  }
  if (prog === "curl" && args.some((a) => a.includes("api.github.com")) && args.some((a) => APPROVE_LINE.test(a))) return deny("approve");
  if (prog === "node" && args.includes("settings") && args.includes("apply")) return deny("settings");
  if (prog === "npm" && args[0] === "run" && args[1] === "settings:apply") return deny("settings");

  if (prog === "git") {
    const { sub, rest, dir } = gitArgs(args);
    if (sub === "push") {
      if (rest.some((a) => a === "-f" || a.startsWith("--force") || (a.startsWith("+") && a.length > 1))) return deny("force");
      if (has(rest, "--all", "--mirror")) return deny("main");
      const refs = rest.filter((a) => !a.startsWith("-")).slice(1);
      if (refs.some((r) => MAIN.test(r.split(":").pop()))) return deny("main");
      if (has(rest, "--delete", "-d") || refs.some((r) => r.startsWith(":"))) return ask("remoteDelete");
      if (!refs.length && /^(main|master)$/.test(currentBranch(path.resolve(ctx.cwd, dir ?? ".")))) return deny("main");
    }
    if (sub === "credential" && /^(fill|get)$/.test(rest[0] ?? "")) return deny("secret");
    if (sub === "reset" && has(rest, "--hard", "--merge", "--keep")) return ask("discard");
    if (sub === "clean" && rest.some((a) => a === "--force" || /^-[a-z]*f/.test(a))) return ask("discard");
    if (sub === "checkout" && (rest.includes("--") || rest.includes(".") || has(rest, "-f", "--force"))) return ask("discard");
    if (sub === "restore" && !(has(rest, "--staged", "-S") && !has(rest, "--worktree", "-W"))) return ask("discard");
    if (sub === "stash" && /^(drop|clear)$/.test(rest[0] ?? "")) return ask("discard");
    if (sub === "branch" && (has(rest, "-D") || (has(rest, "-d", "--delete") && has(rest, "-f", "--force")))) return ask("discard");
    if (sub === "worktree" && rest[0] === "remove" && has(rest, "-f", "--force")) return ask("discard");
    if (/^(filter-branch|filter-repo)$/.test(sub) || (sub === "update-ref" && has(rest, "-d")) || (sub === "reflog" && rest[0] === "expire")) return ask("discard");
  }

  if (via.has("sudo") || via.has("doas")) return ask("install");
  if (prog === "rpm-ostree" && !/^(status|db)$/.test(args[0] ?? "")) return ask("install");
  if (/^(dnf|yum|apt|apt-get|brew|snap|zypper|pacman)$/.test(prog) && args.some((a) => /^(install|remove|erase|upgrade|update|-S\w*|-R\w*)$/.test(a))) return ask("install");
  if (prog === "flatpak" && /^(install|update|uninstall|remove)$/.test(args[0] ?? "")) return ask("install");
  if (prog === "rustup" && (/^(update|default|override|self)$/.test(args[0] ?? "") || (/^(component|target|toolchain)$/.test(args[0] ?? "") && /^(add|install|remove|uninstall)$/.test(args[1] ?? "")))) return ask("install");
  if (prog === "cargo" && /^(install|uninstall)$/.test(args[0] ?? "")) return ask("install");
  if (/^pip3?$/.test(prog) && /^(install|uninstall)$/.test(args[0] ?? "")) return ask("install");
  if (/^python3?$/.test(prog) && args[0] === "-m" && args[1] === "pip" && /^(install|uninstall)$/.test(args[2] ?? "")) return ask("install");
  if (prog === "uv" && ((args[0] === "tool" && /^(install|uninstall|upgrade)$/.test(args[1] ?? "")) || (args[0] === "pip" && args[1] === "install"))) return ask("install");
  if (/^(npm|pnpm|yarn)$/.test(prog) && has(args, "-g", "--global")) return ask("install");

  if (prog === "cargo" && /^(add|remove|rm|update|upgrade)$/.test(args[0] ?? "")) return ask("dependency");
  if (/^(npm|pnpm|yarn)$/.test(prog) && /^(install|i|add|uninstall|remove|rm|un|update|upgrade)$/.test(args[0] ?? "") && args.slice(1).some((a) => !a.startsWith("-"))) return ask("dependency");
  if (prog === "npm" && /^(update|upgrade)$/.test(args[0] ?? "")) return ask("dependency");

  if (prog === "copilot" && (args.length === 0 || has(args, "-p", "--prompt", "--agent", "--autopilot", "-i", "--interactive", "--resume", "--continue"))) return ask("paid");

  if (/^(bitcoind|bitcoin-qt)$/.test(prog)) return ask("node");
  if (prog === "bitcoin-cli") {
    const regtest = has(args, "-regtest") || args.includes("-chain=regtest");
    if (!regtest && args.some((a) => BITCOIN_SECRET_RPC.test(a))) return deny("wallet");
    if (!regtest) return ask("node");
  }

  if (writeTargets(prog, args, words).some((t) => isGuardrailPath(ctx.rel(t)))) return ask("guardrail");
  return null;
}

/** Paths a simple command would write, move or delete. */
function writeTargets(prog, args, words) {
  const out = [];
  words.forEach((w, i) => {
    if (/^(>|>>|>\||&>|&>>|\d>|\d>>)$/.test(w) && words[i + 1]) out.push(words[i + 1]);
  });
  const operands = args.filter((a) => !a.startsWith("-"));
  if (/^(cp|mv|rm|tee|touch|truncate|chmod|chown|ln|install|rsync|patch|unlink|shred)$/.test(prog)) out.push(...operands);
  if ((prog === "sed" || prog === "perl") && args.some((a) => /^-[a-zA-Z]*i/.test(a) || a.startsWith("--in-place"))) out.push(...operands);
  if (prog === "dd") out.push(...args.filter((a) => a.startsWith("of=")).map((a) => a.slice(3)));
  if (prog === "git") {
    const { sub, rest } = gitArgs(args);
    if (/^(checkout|restore|rm|mv|apply|am)$/.test(sub)) out.push(...rest.filter((a) => !a.startsWith("-")));
  }
  return out;
}

/** File paths a non-shell tool call names, including those inside an apply_patch body. A grep pattern is text, a glob pattern a path. */
function toolPaths(tool, args) {
  const out = [];
  const keys = tool === "glob" ? /^(path|paths|pattern|glob)$/ : /^(path|file_path|filePath|filename|file|paths|old_path|new_path|target|source)$/;
  const visit = (v, key) => {
    if (typeof v === "string") {
      if (keys.test(key ?? "")) out.push(v);
      for (const m of v.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)) out.push(m[1].trim());
      for (const m of v.matchAll(/^\*\*\* Move to: (.+)$/gm)) out.push(m[1].trim());
    } else if (Array.isArray(v)) {
      for (const item of v) visit(item, key);
    } else if (v && typeof v === "object") {
      for (const [k, item] of Object.entries(v)) visit(item, k);
    }
  };
  visit(args);
  return out;
}

/** The repository root at or above `dir`: the nearest directory holding `.git`. */
export function findRoot(dir) {
  let at = path.resolve(dir);
  for (;;) {
    if (fs.existsSync(path.join(at, ".git"))) return at;
    const up = path.dirname(at);
    if (up === at) return path.resolve(dir);
    at = up;
  }
}

/**
 * The permission decision for one preToolUse payload, or null to leave the
 * call to the normal permission flow. Accepts the camelCase payload
 * (`toolName`, `toolArgs`) and the VS Code one (`tool_name`, `tool_input`).
 */
export function preToolUse(input) {
  const tool = String(input?.toolName ?? input?.tool_name ?? "").toLowerCase();
  let args = input?.toolArgs ?? input?.tool_input ?? {};
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      args = { command: args };
    }
  }
  const cwd = typeof input?.cwd === "string" && input.cwd ? input.cwd : process.cwd();
  const root = findRoot(cwd);
  const ctx = { cwd, rel: (p) => path.relative(root, path.resolve(cwd, String(p).replace(/^~(?=\/)/, process.env.HOME ?? "~"))).replaceAll("\\", "/") };
  const found = [];

  if (SHELL_TOOLS.has(tool)) {
    const line = String(args.command ?? args.input ?? args.cmd ?? "");
    if (/\b(curl|wget)\b[^|;&]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/.test(line)) found.push({ decision: ASK, reason: REASONS.install });
    for (const simple of simpleCommands(line)) for (const cmd of expand(simple)) {
      const d = commandDecision(cmd, ctx);
      if (d) found.push(d);
    }
  } else {
    const paths = toolPaths(tool, args);
    if (paths.some(isSecretPath)) found.push({ decision: DENY, reason: REASONS.secret });
    const writes = WRITE_TOOLS.has(tool) && args.command !== "view";
    if (writes && paths.some((p) => isGuardrailPath(ctx.rel(p)))) found.push({ decision: ASK, reason: REASONS.guardrail });
    if (/comment|review|issue|pull/.test(tool) && APPROVE_IN_JSON.test(JSON.stringify(args).replaceAll("\\n", "\n"))) found.push({ decision: DENY, reason: REASONS.approve });
    if (/merge/.test(tool)) found.push({ decision: DENY, reason: REASONS.merge });
  }
  const pick = found.find((d) => d.decision === DENY) ?? found.find((d) => d.decision === ASK);
  return pick ? { permissionDecision: pick.decision, permissionDecisionReason: pick.reason } : null;
}

// ---------------------------------------------------------------------------
// stop: run the checks for what the branch changes before a coding agent finishes.

const CHECKS = [
  { id: "firmware", applies: (p) => p.startsWith("firmware/"), command: ["bash", "scripts/gates/firmware-check.sh"], needs: () => onPath("cargo") },
  { id: "control-plane", applies: (p) => /^(src|tests|scripts|\.github)\//.test(p) || /^[^/]+\.json$/.test(p), command: ["npm", "test", "--silent"], needs: (root) => fs.existsSync(path.join(root, "node_modules")) },
];
const MAX_BLOCKS = 3;
const STREAK_MS = 20 * 60 * 1000;

function onPath(name) {
  return (process.env.PATH ?? "").split(path.delimiter).some((dir) => dir && fs.existsSync(path.join(dir, name)));
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 });
}

/** Paths that differ from the merge base with origin/main (committed or not), plus untracked files. */
export function branchChanges(root) {
  let base = "HEAD";
  try {
    base = git(root, ["merge-base", "HEAD", "origin/main"]).trim() || "HEAD";
  } catch {
    // No origin/main: judge the uncommitted changes alone.
  }
  const tracked = git(root, ["diff", "--name-only", "-z", base]).split("\0");
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0");
  return [...new Set([...tracked, ...untracked].filter(Boolean))].sort();
}

/** Identifies the exact state checked: HEAD plus every changed file's content. */
export function fingerprint(root, paths) {
  const hash = crypto.createHash("sha256").update(git(root, ["rev-parse", "HEAD"]));
  for (const p of paths) {
    hash.update(`\0${p}\0`);
    try {
      hash.update(fs.readFileSync(path.join(root, p)));
    } catch {
      hash.update("<absent>");
    }
  }
  return hash.digest("hex");
}

function runCheckCommand(root, command) {
  try {
    execFileSync(command[0], command.slice(1), { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 540_000, maxBuffer: 64 * 1024 * 1024 });
    return { ok: true, output: "" };
  } catch (err) {
    return { ok: false, code: err.status ?? err.signal ?? "error", output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

/**
 * The agentStop decision for the repository at `root`: null to let the agent
 * finish, or a block whose reason becomes the agent's next prompt.
 * `run` and `stateFile` are injectable for tests.
 */
export function stopDecision(root, { run = runCheckCommand, stateFile, checks = CHECKS } = {}) {
  const file = stateFile ?? path.join(git(root, ["rev-parse", "--absolute-git-dir"]).trim(), "copilot-guard-state.json");
  let state = {};
  try {
    state = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    // First run, or an unreadable file: start fresh.
  }
  const save = () => fs.writeFileSync(file, JSON.stringify(state));
  const changed = branchChanges(root);
  const due = checks.filter((c) => changed.some(c.applies));
  if (!due.length) return null;
  const print = fingerprint(root, changed);
  if (state.verified === print) return null;
  // Consecutive blocks; a pass or twenty quiet minutes start a new streak.
  const streak = Date.now() - (state.lastBlock ?? 0) < STREAK_MS ? (state.streak ?? 0) : 0;
  if (streak >= MAX_BLOCKS) return null;

  for (const check of due) {
    if (!check.needs(root)) {
      process.stderr.write(`guard: skipped ${check.command.join(" ")}: its tools are not installed here\n`);
      continue;
    }
    const result = run(root, check.command);
    if (result.ok) continue;
    state = { streak: streak + 1, lastBlock: Date.now() };
    save();
    const tail = result.output.trim().split("\n").slice(-30).join("\n");
    const last = streak + 1 >= MAX_BLOCKS ? " This hook will not block again for a while; report the failure." : "";
    return {
      decision: "block",
      reason: `Before you finish: \`${check.command.join(" ")}\` fails on this branch (exit ${result.code}). Last lines:\n${tail}\n\nFix the cause and run it again. If you cannot, stop and say in your report that it fails and why; do not report the task as done.${last}`,
    };
  }
  state = { verified: print };
  save();
  return null;
}

async function readStdin() {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

async function main() {
  const mode = process.argv[2];
  const raw = await readStdin();
  let input = {};
  try {
    input = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    process.stderr.write("guard: payload is not JSON; no decision\n");
    return;
  }
  let out = null;
  if (mode === "pre-tool-use") out = preToolUse(input);
  else if (mode === "stop") out = stopDecision(findRoot(typeof input.cwd === "string" && input.cwd ? input.cwd : process.cwd()));
  else process.stderr.write(`guard: unknown mode ${mode ?? "(none)"}; expected pre-tool-use or stop\n`);
  if (out) process.stdout.write(`${JSON.stringify(out)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main().catch((err) => {
    process.stderr.write(`guard: internal error, no decision: ${err?.stack ?? err}\n`);
  }).finally(() => {
    process.exitCode = 0;
  });
}
