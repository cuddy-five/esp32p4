# Runbook: settings reconciliation

Keeps repository labels and rulesets equal to the desired state declared in
`.github/control-plane/settings/`.

## Mental model

```
desired (JSON in git)  ──plan──►  ops  ──apply──►  GitHub
          ▲                                           │
          └──────────────── export ───────────────────┘
```

- `plan` is read-only and always exits 0.
- `check` is `plan` that exits 2 when drift exists. Use it as a gate.
- `apply` executes the plan. Requires `--yes`.
- `export` writes the live state in desired-file format for bootstrapping.

Op types: `create`, `update`, `rename` (labels, via `aliases`), `delete`
(only with `prune: true`), `unmanaged` (live but undeclared, informational),
`noop`.

## Routine operations

### See what would change

```bash
node src/cli.js settings plan
node src/cli.js settings plan --only rulesets --verbose
node src/cli.js settings plan --format markdown
```

### Enrol an existing repository

1. Snapshot live state so the first plan is a no-op:
   ```bash
   node src/cli.js settings export labels   --repo org/repo > /tmp/labels.json
   node src/cli.js settings export rulesets --repo org/repo > /tmp/rulesets.json
   ```
2. Edit to taste; add `aliases` for labels you intend to rename.
3. Commit under `.github/control-plane/settings/` and open a PR. The
   `settings-sync` workflow posts the plan to the job summary.
4. After merge, run the `settings-sync` workflow manually with `apply: true`.

### Apply

Local:

```bash
GH_TOKEN=<token with Issues: write and Administration: write> \
  node src/cli.js settings apply --yes
```

Actions: run `settings-sync` from the Actions tab with `apply` checked.
Optional inputs `only` (for example `labels`) and `repo` (another
repository) are passed through. The `apply` job runs in the `settings-admin`
environment; add required reviewers there for a human approval step.

### Rename a label without losing issue associations

Declare the new name with the old name in `aliases`:

```json
{ "name": "kind:bug", "color": "d73a4a", "description": "Something is broken", "aliases": ["bug"] }
```

The plan shows `> rename bug -> kind:bug`. The apply uses `PATCH` with
`new_name`, so issues keep the label. Once applied, the alias is inert and can
stay or go.

### Remove labels or rulesets

Set `"prune": true` in the relevant file. Everything live and undeclared
becomes a `delete` op. Review the plan carefully before applying; the
`unmanaged` list from a prior plan is exactly what will be removed.

## Tokens and permissions

| Need | Permission | `github.token` sufficient? |
|---|---|---|
| Read labels, rulesets | Metadata: read | yes |
| Write labels | Issues: write | yes (`permissions: issues: write`) |
| Write rulesets | Administration: write | no |

Provide a fine-grained PAT or GitHub App installation token as the
`CONTROL_PLANE_TOKEN` repository secret for ruleset writes. The workflows
fall back to `github.token` when it is absent, so label-only setups need no
secret.

## Troubleshooting

**`403 Resource not accessible by integration` on apply.** The token lacks
the write permission above. Ruleset writes with `github.token` always fail
this way.

**Rulesets show drift immediately after apply.** You are in `strict` mode and
GitHub added defaults. Either switch to `"comparison": "declared"` or run
`settings export rulesets` and declare the defaults.

**A required status check context does not exist yet.** GitHub accepts the
ruleset but every PR is blocked until a check with that name reports. Add
the workflow first, then the ruleset.

**Plan shows `update` for a label whose only change is name casing.** This is
intentional: GitHub matches names case-insensitively, but the display name is
set to exactly what you declared.

**`could not determine repository`.** Pass `--repo owner/name` or set
`GH_REPO`. In Actions, `GITHUB_REPOSITORY` is used automatically.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success; for `check`, no drift |
| 1 | Usage error, missing token, API failure |
| 2 | `check` found drift |
