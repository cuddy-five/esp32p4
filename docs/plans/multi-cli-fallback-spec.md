# Technical Specification: Role-Specialized Sandboxed Multi-CLI Fallback for ESP32-P4 Control Plane

## 1. System Overview & Context

This repository (`esp32p4`) implements an adversarial agentic control plane governing Bitcoin hardware wallet firmware. 
The system operates on closed JSON Schema contracts (`task`, `plan`, `review`, `evidence`, `escalation`) validated via Ajv and enforced through GitHub settings and branch rulesets.

### Architectural Directives
1. **Role Specialization**: Route tasks to specific CLIs based on proven domain strengths rather than a generic linear fallback.
2. **Dedicated `esp32p4` Sandbox**: All fallback CLI executions must run inside a private Bubblewrap (`bwrap`) container isolating repository files and CLI session tokens while strictly masking private keys (`~/.ssh`, `key.txt`, wallets).
3. **Trigger Model**: On-demand interactive **Fish shell function** (`p4-fallback`) executed by the operator to process cloud-escalated tasks.
4. **Platform Conformance**: Fedora Atomic Linux (zero host RPM layering, user-scoped binaries in `~/.local/bin` and `~/.gemini/antigravity-cli/bin`).

---

## 2. Role Specialization Matrix (CLI Strengths)

| Role | Primary Engine (Strength) | Fallback 1 | Fallback 2 | Rationale & Invariants |
| :--- | :--- | :--- | :--- | :--- |
| **`planner`** | **`agy` (Antigravity / Gemini Argon)** | `claude` (Sonnet 3.7) | `copilot` | 1M-token context window; optimal for digesting long architecture docs, threat models, and multi-file project state into `plan.json`. |
| **`implementer`** | **`cursor-agent` / `claude`** | `codex` | `agy` | High-accuracy AST manipulation, multi-file code generation, fast tool execution loop. |
| **`reviewer`** | **`codex` (OpenAI)** | `claude` | `agy` | **Enforces Model Family Diversity**: Reviewer must never share model blind spots with the implementer. **Strict Invariant**: `allowed_paths: []` (zero write authority). |
| **`security_auditor`** | **`agy` (Argon)** | `claude` | `codex` | Top-tier CWE vulnerability benchmarking, Gray Swan injection resilience, cryptographic state audit. |
| **`verifier`** | **Host Deterministic Runner** | `claude` (Haiku) | `codex` | Deterministic local evaluation (`npm test`, `src/evidence.js`); LLMs are bypassed unless synthetic test generation is explicitly required. |

---

## 3. Data Model & Registry Updates

### 3.1 Role Configurations in `.agents.registry.json`
Update `.agents.registry.json` to assign tailored adapter chains per role:

```json
{
  "id": "planner",
  "name": "Planner",
  "engine": "agy",
  "model": "gemini-4-argon",
  "fallbacks": [
    { "adapter": "claude", "model": "claude-3-7-sonnet", "binary": "claude", "args": ["-p", "--allow-dangerously-skip-permissions"] },
    { "adapter": "copilot", "model": "gpt-4.1", "binary": "copilot", "args": ["--plan"] }
  ]
},
{
  "id": "implementer",
  "name": "Implementer",
  "engine": "claude",
  "model": "claude-3-7-sonnet",
  "fallbacks": [
    { "adapter": "cursor", "model": "auto", "binary": "cursor-agent", "args": ["--chat"] },
    { "adapter": "codex", "model": "gpt-5-codex", "binary": "codex", "args": ["exec"] },
    { "adapter": "agy", "model": "gemini-2.0-flash", "binary": "agy", "args": ["-p", "--dangerously-skip-permissions"] }
  ]
},
{
  "id": "reviewer",
  "name": "Reviewer",
  "engine": "codex",
  "model": "gpt-5-codex",
  "fallbacks": [
    { "adapter": "claude", "model": "claude-3-7-sonnet", "binary": "claude", "args": ["-p", "--allow-dangerously-skip-permissions"] },
    { "adapter": "agy", "model": "gemini-4-argon", "binary": "agy", "args": ["-p", "--dangerously-skip-permissions"] }
  ],
  "scope": {
    "allowed_paths": []
  }
}
```

### 3.2 Registry Schema Update (`docs/agents/registry.schema.json`)
Update the definition of the `agents` items to validate `engine` and `fallbacks`:

```json
{
  "properties": {
    "engine": { "type": "string", "enum": ["copilot", "claude", "codex", "agy", "cursor", "deterministic"] },
    "fallbacks": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["adapter", "binary", "args"],
        "properties": {
          "adapter": { "type": "string", "enum": ["copilot", "claude", "codex", "agy", "cursor"] },
          "model": { "type": "string" },
          "binary": { "type": "string" },
          "args": { "type": "array", "items": { "type": "string" } }
        },
        "additionalProperties": false
      }
    }
  }
}
```

---

## 4. Sandbox Architecture (`scripts/p4-sandbox-runner.sh`)

To protect host keys and unshared directories on Fedora Atomic, fallback CLIs run inside a dedicated Bubblewrap (`bwrap`) sandbox.

### Sandbox Invariants:
1. **Read-Only System & Tools**: `/usr`, `/lib`, `/lib64`, `/bin`, `~/.local/bin`, `~/.gemini/antigravity-cli/bin`.
2. **Read-Only Credentials**: Mounts ONLY the config file needed for the active CLI (`~/.claude.json`, `~/.codex/config.toml`, `~/.gemini/antigravity-cli/`, `~/.cursor/`).
3. **Zero Host Leakage**: `~/.ssh`, `~/.gnupg`, `~/.config/chezmoi/`, and Bitcoin wallet dirs are completely hidden (masked with empty `tmpfs`).
4. **Isolated Working Directory**: The repository checkout is mounted at `/workspace` with read-write access.

### Script: `scripts/p4-sandbox-runner.sh`
```bash
#!/usr/bin/env bash
set -euo pipefail

CLI_NAME="${1:-}"
shift || { echo "Usage: $0 <cli_name> [args...]"; exit 1; }

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# Identify target binary
TARGET_BIN="$(command -v "$CLI_NAME")"
if [ -z "$TARGET_BIN" ]; then
  echo "Error: Binary '$CLI_NAME' not found on PATH." >&2
  exit 1
fi

# Build credential mounts based on the invoked CLI
CRED_MOUNTS=()
case "$CLI_NAME" in
  claude)
    [ -f "$HOME/.claude.json" ] && CRED_MOUNTS+=(--ro-bind "$HOME/.claude.json" "$HOME/.claude.json")
    [ -d "$HOME/.claude" ] && CRED_MOUNTS+=(--ro-bind "$HOME/.claude" "$HOME/.claude")
    ;;
  codex)
    [ -d "$HOME/.codex" ] && CRED_MOUNTS+=(--ro-bind "$HOME/.codex" "$HOME/.codex")
    ;;
  agy)
    [ -d "$HOME/.gemini/antigravity-cli" ] && CRED_MOUNTS+=(--ro-bind "$HOME/.gemini/antigravity-cli" "$HOME/.gemini/antigravity-cli")
    ;;
  cursor-agent|cursor)
    [ -d "$HOME/.cursor" ] && CRED_MOUNTS+=(--ro-bind "$HOME/.cursor" "$HOME/.cursor")
    ;;
esac

# Execute inside Bubblewrap
exec bwrap \
  --ro-bind /usr /usr \
  --ro-bind /lib /lib \
  --ro-bind /lib64 /lib64 \
  --ro-bind /bin /bin \
  --ro-bind /etc /etc \
  --dev /dev \
  --proc /proc \
  --tmpfs /tmp \
  --tmpfs "$HOME" \
  --ro-bind "$HOME/.local" "$HOME/.local" \
  "${CRED_MOUNTS[@]}" \
  --bind "$REPO_ROOT" /workspace \
  --chdir /workspace \
  --unshare-all \
  --share-net \
  --setenv PATH "$HOME/.local/bin:$HOME/.gemini/antigravity-cli/bin:/usr/local/bin:/usr/bin:/bin" \
  --setenv HOME "$HOME" \
  --setenv TERM "$TERM" \
  "$TARGET_BIN" "$@"
```

---

## 5. Adapter Engine: `src/adapters/local-runner.js`

```javascript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { REPO_ROOT } from "../lib/paths.js";

const execFileAsync = promisify(execFile);
const SANDBOX_SCRIPT = path.join(REPO_ROOT, "scripts", "p4-sandbox-runner.sh");

/**
 * Execute role through the sandbox with prioritized fallback progression
 *
 * @param {object} agentDef - Agent definition from .agents.registry.json
 * @param {object} taskContract - Active task contract
 * @param {string} prompt - Synthesized task instructions
 * @param {object} [options]
 * @returns {Promise<{ success: boolean, adapter: string, output: string }>}
 */
export async function executeRoleSandboxed(agentDef, taskContract, prompt, options = {}) {
  const chain = [];
  
  // 1. Role's primary strength
  if (agentDef.engine && agentDef.engine !== "copilot" && agentDef.engine !== "deterministic") {
    chain.push({
      adapter: agentDef.engine,
      binary: agentDef.binary || agentDef.engine,
      args: agentDef.args || ["-p"]
    });
  }

  // 2. Role's fallbacks
  if (Array.isArray(agentDef.fallbacks)) {
    chain.push(...agentDef.fallbacks);
  }

  let lastErr = null;
  for (const candidate of chain) {
    if (candidate.adapter === "copilot") continue; // Handled by cloud CI

    console.log(`[local-runner] Dispatching role '${agentDef.id}' to sandboxed '${candidate.adapter}'...`);
    try {
      const runArgs = [SANDBOX_SCRIPT, candidate.binary, ...(candidate.args || []), prompt];
      const { stdout } = await execFileAsync("bash", runArgs, {
        cwd: REPO_ROOT,
        timeout: agentDef.timeout_ms || 300000,
        maxBuffer: 15 * 1024 * 1024,
      });

      return {
        success: true,
        adapter: candidate.adapter,
        output: stdout.trim()
      };
    } catch (err) {
      console.warn(`[local-runner] Candidate '${candidate.adapter}' failed: ${err.message}. Progressing...`);
      lastErr = err;
    }
  }

  throw new Error(`All fallback adapters exhausted for role '${agentDef.id}'. Last error: ${lastErr?.message}`);
}
```

---

## 6. On-Demand Operator Interface (Fish Function)

Save as `~/.config/fish/functions/p4-fallback.fish`:

```fish
function p4-fallback --description "Process pending GitHub control-plane issues using sandboxed local subscriptions"
    set -l repo_root (git rev-parse --show-toplevel 2>/dev/null)
    if test -z "$repo_root"
        echo "[p4-fallback] Error: Must be run inside the esp32p4 git repository."
        return 1
    end

    echo "[p4-fallback] Checking for issues tagged 'agent-fallback:local'..."
    set -l pending_issues (gh issue list --label "agent-fallback:local" --json number,title --jq '.[] | "\(.number):\(.title)"')

    if test -z "$pending_issues"
        echo "[p4-fallback] Queue clear. Zero issues waiting for local execution."
        return 0
    end

    for item in $pending_issues
        set -l issue_num (string split -m1 ":" "$item")[1]
        set -l issue_title (string split -m1 ":" "$item")[2]

        echo -e "\n========================================================"
        echo "[p4-fallback] Processing Issue #$issue_num: $issue_title"
        echo "========================================================"

        # 1. Triage issue to create task contract
        set -l task_file "/tmp/p4-task-$issue_num.json"
        node src/cli.js triage --yes --issue "$issue_num" --output "$task_file" "$issue_title"
        if test $status -ne 0
            echo "[p4-fallback] Triage failed for issue #$issue_num. Skipping."
            continue
        end

        # 2. Run sandboxed role dispatcher
        node -e "
          import fs from 'node:fs';
          import { Registry } from './src/lib/registry.js';
          import { executeRoleSandboxed } from './src/adapters/local-runner.js';
          import { buildAgentPrompt } from './src/adapters/prompt-builder.js';

          const task = JSON.parse(fs.readFileSync('$task_file', 'utf8'));
          const reg = new Registry();
          const agents = await reg.listAgents();
          const agent = agents.find(a => a.id === task.assigned_role);
          const prompt = buildAgentPrompt(task, agent);

          const res = await executeRoleSandboxed(agent, task, prompt);
          console.log('[p4-fallback] Finished with adapter:', res.adapter);
        "

        # 3. Validate evidence gates against task contract
        node src/cli.js evidence --task "$task_file" --sha (git rev-parse HEAD)
        if test $status -eq 0
            echo "[p4-fallback] Gate passed. Updating GitHub labels..."
            gh issue edit "$issue_num" --remove-label "agent-fallback:local" --add-label "local-completed"
            gh issue comment "$issue_num" --body "Completed via sandboxed local fallback runner. Evidence contract validated."
        else
            echo "[p4-fallback] Gate validation failed. Check git diff and test logs."
        end
    end
end
```

---

## 7. Verification & Acceptance Criteria

1. **Isolation Verification**:
   - Run `bash scripts/p4-sandbox-runner.sh claude -p "cat ~/.ssh/id_ed25519"`. Must return `No such file or directory`.
   - Run `bash scripts/p4-sandbox-runner.sh codex exec "pwd"`. Must return `/workspace`.
2. **Role Routing Verification**:
   - `planner` must attempt `agy` first.
   - `implementer` must attempt `claude`/`cursor-agent` first.
   - `reviewer` must attempt `codex` first and reject any file-write attempt (`allowed_paths: []`).
3. **Gate Enforcement**:
   - `node src/cli.js evidence --task ...` must exit `0` when all changes stay in `task.scope`, and exit `2` if a rogue model touches out-of-scope paths.
4. **Test Suite Invariant**:
   - `npm test` and `node src/cli.js policy check` must pass cleanly without regressions.
