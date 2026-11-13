# Evidence and review-domain reporting

The evidence command records facts about one commit: what it changed, which
checks ran on it, and which review checklists apply. With `--base` it reads the
changed files from git, and with `--run` it runs the checks itself, so neither
is a typed claim. It also maps the changed paths to enabled domains in the
repository's `.review-domains.json` and reports the required roles, security
roles, and complete checklists. This is a mapping of requirements, not proof
that reviews occurred or permission to merge. The command does not authenticate
reviewers or verify that supplied usage figures are true.

## Read the diff from git and run the checks

This is the form a verifier uses. Run it from the repository root, in a
checkout of the commit under review:

```fish
node src/cli.js evidence --task task.json --sha <commit-sha> --base origin/main \
  --run "npm test" --run "node src/cli.js policy check" \
  --producer-kind agent --producer-name verifier --producer-role verifier \
  --output evidence-verify.json
```

`--base <ref>` names what the commit is compared with. The command reads the
changed paths and the added and deleted line counts from
`git diff <ref>...<commit-sha>`, which starts at the point where the two
histories split, so later commits on the base branch are not counted. Files
under the task's own records directory
(`.github/control-plane/records/<task_id>/`) are left out, because records
describe a commit and are committed after it. Do not combine `--base` with
`--path`, `--files-changed`, `--additions`, `--deletions` or `--base-sha`; the
command refuses, so a typed number can never override git.

`--run <command>` runs one check through `sh -c` from the repository root and
records its name, whether it passed, and how long it took. Repeat it for each
check. Every command runs even when an earlier one fails. `--run-timeout
<seconds>` limits each command (default 900); a command that runs out of time
is recorded as `timed_out`.

A check proves something about a commit only if it ran on that commit's files.
Before running anything, the command compares the checkout with
`<commit-sha>` and refuses when a tracked file differs or an untracked file is
present (ignored files and the task's records directory do not count). It
compares again afterwards: if a check rewrote a file, it writes no evidence.
The check does not need `HEAD` to be `<commit-sha>`, so it still works after
records-only commits.

When a check fails, the evidence is still written, with that check marked
`failure`, the end of its output is printed to stderr, and the command exits
`2`. The `verification_passed` gate then fails on that evidence, as it should.
For a change under `firmware/`, add
`--run "bash scripts/gates/firmware-check.sh"`.

Limits: a recorded check shows that the command exited `0` on those files on
this computer. It does not show that the command tests the right thing, and it
is not evidence from a device. The command does not count individual tests;
the `tests` block of the evidence contract stays empty unless a role adds it.

## Save evidence and the full report

From the repository root, with a task contract and a real commit SHA:

```fish
node src/cli.js evidence --task task.json --sha <commit-sha> --path src/cli.js --output evidence.json > evidence-report.json
```

`node` executes `src/cli.js`; `evidence` builds and validates the evidence
contract. `--task` selects the task file. `--sha` supplies the 40-character
lowercase commit SHA. Repeat `--path` for each changed repository-relative file;
this form takes your word for the paths, so prefer `--base` when git has the commit.
`--output` writes only the standalone evidence contract to `evidence.json`.
The shell's `>` redirects the complete default JSON response to
`evidence-report.json`; use different paths for these two outputs.

The JSON response has `evidence`, `gates`, and `review_domains`. The last contains
`covered` (including each domain's checklist and matched paths), `uncovered`,
`required_roles`, and `required_security_roles`. Structured mapping remains
outside the closed evidence schema. The evidence contract itself retains a
`review.domains` entry in `policy_results`. Preserve the complete response when
passing checklist requirements to another role.

Two useful options:

- `--format markdown` prints a readable report with every applicable checklist;
  `--format json` explicitly selects the default response.
- `--summary` appends the same Markdown to `GITHUB_STEP_SUMMARY` when that
  environment variable is set by GitHub Actions. Without it, this option is a
  no-op. It does not change stdout or the standalone evidence output.

## Outcomes and limits

A mapping is `pass` when all supplied paths match enabled domains, `warn` when
some are uncovered, or `skipped` when no paths are supplied. Duplicate paths
are mapped once. Invalid relative paths or domain configuration produce an
error. There is no CLI domain-file override.

The scope and budget gates and the `--run` checks determine exit status: `0`
when all pass, `2` when any fails, and `1` for usage or runtime errors. An uncovered
path warning alone does not block the command. A mapping `pass` means coverage,
not a successful code review. Separate reviewer identity, completed reviews,
acceptance evidence, and human approval remain necessary under the team runbook.
No paths means no mapping evidence; it does not prove an empty Git diff.

The firmware domain is enabled: a path under `firmware/` maps to its checklist
and names the security auditor. The mapping reports what a review must cover;
it does not run the Rust checks. `bash scripts/gates/firmware-check.sh` and
CI's `firmware` job do that.
