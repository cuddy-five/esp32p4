# Evidence and review-domain reporting

The evidence command maps supplied changed paths to enabled domains in the
repository's `.review-domains.json`. It reports the required roles, security
roles, and complete checklists. This is a mapping of requirements, not proof
that reviews occurred or permission to merge. The command does not authenticate
reviewers, collect the Git diff, or verify that supplied usage figures are true.

## Save evidence and the full report

From the repository root, with a task contract and a real commit SHA:

```fish
node src/cli.js evidence --task task.json --sha <commit-sha> --path src/cli.js --output evidence.json > evidence-report.json
```

`node` executes `src/cli.js`; `evidence` builds and validates the evidence
contract. `--task` selects the task file. `--sha` supplies the 40-character
lowercase commit SHA. Repeat `--path` for each changed repository-relative file.
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

The existing scope and budget gates still determine exit status: `0` when both
pass, `2` when either fails, and `1` for usage or runtime errors. An uncovered
path warning alone does not block the command. A mapping `pass` means coverage,
not a successful code review. Separate reviewer identity, completed reviews,
acceptance evidence, and human approval remain necessary under the team runbook.
No paths means no mapping evidence; it does not prove an empty Git diff.

The firmware domain remains disabled. Testing a synthetic firmware mapping does
not activate it or begin firmware development.
