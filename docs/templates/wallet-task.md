# Wallet task worksheet

Use this in an issue or conversation to give one agent enough context for one
bounded task. Reuse facts already supplied by the owner. It is not an extra
mandatory form, an approval, or a substitute for task records when the base
branch's review domain requires them. See [wallet development](../runbooks/wallet-development.md).

## Fill only what this task needs

- **Outcome:** One behavior or decision the reviewer can check.
- **Starting point:** Branch, commit and relevant existing API or files.
- **Allowed changes:** Exact paths; preserve these interfaces and behaviors.
- **Excluded work:** Related work that this task must not attempt.
- **Source packet:** Relevant primary-source sections, pinned revisions, fixture
  provenance and the applicable `device-references` sheet. Do not attach the
  whole research archive.
- **Decisions:** Accepted choices; unknown choices and who resolves them.
- **Input limits:** Applicable bytes, counts, monetary bounds and resource
  limits. State which limits are still undecided.
- **Acceptance:** A small table of input/condition, expected behavior, and the
  test or observation that proves it. Include rejection and cancellation cases.
- **Checks:** Exact commands, environment, independent expected results and
  hardware observations needed. Mark unavailable checks pending.
- **Stop conditions:** Missing decision, source conflict, failed oracle,
  unavailable review, scope change, budget limit, or two failed repair rounds.
- **Handoff:** Exact snapshot, sources, actual results, remaining problems and
  next responsible role. Name the separate reviewer, auditor and verifier.
- **Authority:** Existing permission for writes and tests; who owns commits,
  paid runs, publication, hardware actions and merge.

## When task records are required

When `.review-domains.json` on the base branch marks `firmware` as
`task_required`, a firmware pull request must commit records under
`.github/control-plane/records/<task_id>/`. The lines above then go into those
records. Copy the shapes from `.github/control-plane/contracts/examples/` and
check every file with `node src/cli.js validate <file>`.

| Worksheet line | Record and field |
| --- | --- |
| Outcome | `task.json`: `title`, `intent` |
| Acceptance | `task.json`: `acceptance_criteria` (one `statement` per row) |
| Allowed changes, excluded work | `task.json`: `scope.allowed_paths`, `scope.forbidden_paths` |
| Decisions still unknown | `plan.json`: `open_questions`; fixed choices go in `assumptions` |
| Steps, files and tests | `plan.json`: `steps` (`files_touched`, `tests`), `verification_strategy`, `rollback_strategy` |
| Checks actually run | Verifier evidence from `node src/cli.js evidence --base <ref> --run <command>` |
| Handoff | `handoff.json`: `context_summary`, `working_ref`, `blockers`, `next_actions` |

`node src/cli.js task status --discover --base origin/main --head-sha <sha>`
then says which record is missing and which role acts next.

## Worked example: specify the signing boundary

This example prepares a decision and test plan. It does not choose wallet policy
or authorize a firmware implementation.

**Outcome:** A reviewed table defining what a future signer accepts and rejects
before it can use the transaction reader and unified digest in `wallet-core`.

**Starting point:** `PROJECT.md` says whether the reader and digest are merged
or still in a pull request; they hold no key and sign nothing. Read the actual
parser and digest APIs at that revision, the pinned
`fork-rules.md` source sections, and BIP174's signer responsibilities.

**Allowed changes:** The task's issue or conversation specification. Name a
specific documentation path if the owner wants it saved. Firmware changes,
new dependencies, library selection and hardware operations are excluded.

**Fixed choices:** Unified-only signing; no persistence of private keys or
seeds. **Pending choices:** supported scripts and PSBT versions, permitted
unified hash modes, supported networks, transaction/resource limits, amount
and fee policy, RDTS handling, and how the device proves change ownership.
Ask the owner about unresolved product choices; do not invent defaults.

| Condition | Required decision or expected behavior | Proposed proof |
| --- | --- | --- |
| Requested hash type lacks the unified bit | Reject; no legacy fallback | Public fixture with an explicit rejection |
| `SINGLE` input has no corresponding output | Reject under pinned fork rules | Independently derived negative case |
| Missing or inconsistent spent-output data | Reject before approval/signing | PSBT consistency cases tied to source requirements |
| No outputs, excessive amounts/fees, or unsupported mode | Resolve explicit policy first | Approved boundary table, then below/at/above-limit tests |
| User cancels or the transaction changes after approval | No signature for the cancelled or changed transaction | Planned state-transition test, separate from digest vectors |

**Acceptance:** Every row cites its rule or owner decision and names a test;
unknown rows block only their dependent implementation. A reviewer checks the
table independently. A security auditor checks the signing boundary. The owner
decides remaining policy choices. No fabricated passing test result is needed
to finish this specification task.
