# Agent memory: proposed operating design

Status: proposal only, based on the local checkout inspected on 2026-10-13.
This defines what a future implementation should do. It activates no storage,
retrieval, permissions, publishing, retention, or orchestration behavior.

Memory should let the next agent resume from a short, checkable handoff. It
must preserve the task, work, evidence, and unresolved decisions without
making a chat transcript into policy or an old approval into new permission.

## Current capabilities and gaps

- The [CLI](../../src/cli.js) validates contracts, displays schemas, checks
  policy declarations, calculates required human stages, and manages settings.
  It has no memory, checkpoint, retrieval, dispatcher, or approval-verification command.
- [ContractRegistry](../../src/lib/contracts.js) validates document shape.
  It does not authenticate authors, verify links or hashes, enforce supported
  schema versions, prove test execution, or decide whether an approval is valid.
- The [context directories](../../.github/control-plane/context/) contain
  empty `.gitkeep` files. [Retention](../../.github/control-plane/policies/retention.yaml.disabled)
  remains disabled. [`.gitignore`](../../.gitignore) excludes `.runtime/`.
- [Approvals policy](../../.github/control-plane/policies/approvals.yaml)
  requires a human merge decision at every risk level. High and critical risk,
  and sensitive paths or tags, can require earlier decisions. Approval expires
  after 72 hours. The [state machine](../../.github/control-plane/orchestration/state-machine.yaml)
  declares most gates as planned; it does not execute them.
- Some older [architecture prose](adversarial-loop.md) describes weaker
  low-risk merge rules. Read current policy and schemas for the actual local
  declarations. Local edits do not prove that remote policy has been published.

## Authority and storage

Use three layers, each with a different purpose:

| Layer | Proposed location and owner | Authority |
|---|---|---|
| Project rules and accepted decisions | Reviewed repository instructions, schemas, policies, architecture and ADRs | Project requirements at a recorded revision; changes follow normal owner review |
| Durable task record | JSON contract comments on the existing task Issue; use its PR when the task originates there | Original records plus verified source identity and exact content; never a copied summary alone |
| Working context | `.runtime/tasks/<task-id>/` in each local or cloud checkout | Disposable downloads, derived index, role packets, and work-in-progress files |

Choose Issue/PR records for the first implementation: small JSON documents
already fit the human-visible workflow. Posting must be authorized for that
task and destination; this proposal authorizes no posting. An authenticated
coordinator-side publisher saves each role's contract without changing its
producer or claiming to be that role. Roles receive records through handoffs.
Local-only tasks keep records locally and are explicitly not cloud-recoverable
until an authorized durable destination holds both their contracts and all work
bytes needed to resume. Publishing contracts alone does not preserve unfinished files.

Publish a new comment per record instead of overwriting prior checkpoints.
Address each version by repository, Issue/PR, comment ID and SHA-256 of the
exact stored UTF-8 JSON bytes. The publisher reads it back before reporting
persistence. Every fetch, including a cache-free resume, checks authenticated
source identity and platform-supplied edit metadata. Admit only a source known
to be never edited; edited or indeterminate sources require reconciliation.
Hashing a fresh download alone proves neither originality nor authorship.

Dependent contracts bind source URI and digest in `artifacts[]` where available;
otherwise use `annotations.memory_source_refs`, a JSON-encoded string array of
URI/digest pairs. These are proposed linkage conventions, not authority. A local
index can be rebuilt from admitted sources. Deletion or compromise of all source
records is unrecoverable without a separate archive; this design supplies none.

This avoids checkpoint commits, code-branch SHA changes, and writing runtime
data under policy-protected `.github/control-plane/**`. Commits remain with
the owner. It does not make GitHub comments immutable or provide a backup.
Large logs can use linked artifacts, but required resume facts must also be
in the durable contracts. GitHub workflow artifacts disappear when their run
is deleted; unavailable proof must be regenerated before a gate can use it.
See [GitHub's artifact lifecycle](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts).

Recoverable work requires either an authorized, reachable committed revision
containing the exact work, or durable staged and unstaged patches plus necessary
allowed untracked-file contents and a recoverable base revision. Bind these
artifacts to verified digests; hashes identify bytes but cannot restore them.
Preserve source authorization, visibility, secret exclusions and acquisition limits.
If no authorized destination exists or required content exceeds those limits,
report the checkpoint as local-only; never automatically commit or upload work.

Keep the minimal record set together: task, current and superseded plans,
handoffs, evidence, reviews, escalations and final result. Approval provenance
stays linked to the original human event. Cache an index of IDs, source URLs,
digests, task/plan links and supersession; it is a locator, not another contract.
The ordering and size rules below are proposed defaults awaiting enforcement.

## What each role saves and retrieves

All roles read applicable instructions, task scope, acceptance criteria and
current policy. The table describes additional task memory. Role scratch
contains temporary observations, never a durable chain-of-thought transcript.

| Role | Retrieve | Save for others |
|---|---|---|
| Coordinator | Current contracts, source receipts, approvals, blockers and budgets | Task snapshots, routing handoffs, escalations, one terminal result and locator index |
| Planner | Task, relevant project decisions, directly relevant code and prior plan findings | Plan with assumptions, source-backed constraints, tests, rollback and unresolved questions |
| Implementer | Task, accepted current plan, verified approval where required, assigned findings | Changed artifacts and handoff: completed work, exact revision, test locations, failures and next action |
| Reviewer | Task, plan, applicable rules, exact diff and evidence | Own review, criterion checklist and findings; never edits the implementation |
| Security auditor | Same concrete inputs plus applicable threat model and relevant scans | Own security review and unresolved security findings |
| Verifier | Task, plan, exact subject and required checks | Fresh evidence from its own execution and its verification review |
| Human | Plan and concise decision packet with source links | Original approval, escalation resolution, requested changes or halt |

Reviewer and auditor packets exclude implementer scratch, speculative
reasoning and conversation history. Verifiers use existing evidence to identify
what to check, then rerun it. Reviewed artifacts and facts may cross boundaries;
private reasoning may not. Preserve `producer.name`, `role`, `model` and run
references when supplied. A new role label on the same agent is not independence.
Use a distinct review model family where available; report the limitation otherwise.

Separate role directories help retrieval but are not a security boundary on a
shared filesystem. A future dispatcher must construct role-specific packets;
stronger isolation requires separate sessions and restricted tool access.

## Checkpoints and recovery

Checkpoint at role transfer, plan supersession, review or verification completion,
approval or escalation change, impending context compaction, session exit,
material blocker, and before an authorized external mutation. Do not checkpoint
every tool call. After an external mutation, save its observed outcome and source.
An interrupted mutation stays unknown until checked; never replay it blindly.

Use `handoff.context_summary` for a compact resume card: task and plan IDs,
what completed, what remains, current subject, blockers, relevant record IDs
and the next action. Aim for 200–400 words; put large outputs in referenced
artifacts. Report observations and decisions with sources, not a transcript.
Use `working_ref`, `artifacts`, `blockers`, `next_actions`, `budget_remaining`
and `expires_at` rather than embedding replacements for those fields in prose.

For local work, save contracts atomically in the ignored runtime directory.
After contract and source validation, the coordinator may dispatch an explicitly
local handoff to a receiver using the same checkout and accessible work files.
A successful local write is not a successful durable checkpoint. Cross-workspace
transfer and planned workspace teardown require confirmed durable contracts and
all work bytes needed to resume, using the storage rules above. Publish only when
authorized; until persistence is confirmed, keep the checkpoint local-only and
do not dispatch a cross-workspace receiver or tear down its sole recoverable copy.

Resume by locating the task's original records, validating supported schemas,
checking links and source integrity, selecting the current plan and unresolved
blockers, then refreshing revision and approval state. Rebuild the local index
and role packet; request a fresh handoff if expired. If an artifact is missing,
recreate it only when safe and within scope; otherwise escalate the dependency.
Do not infer completion, approval or remaining budget from absence of a record.

## Retrieval and context limits

1. Load task identity, current accepted scope, policy revision, current plan ID,
   latest valid routing handoff, open escalations and required approval references.
2. Fetch that role's necessary contracts and exact referenced artifacts. Filter
   by repository, task, role visibility, plan and subject before ranking relevance.
3. Retrieve narrowly from linked paths or search terms. Prefer current direct
   evidence over historical summaries. Label history as such and retain its source.
4. Summarize optional background only. Keep task constraints, acceptance criteria,
   blocking findings and approval limitations explicit and traceable.

Proposed starting limits: a 6,000-token initial packet target, a 12,000-token
packet ceiling, and at most two additional targeted retrieval rounds before
reporting a missing-context blocker. Honor a lower remaining task budget.
These are tuning defaults, not measured performance or schema limits. If mandatory
material exceeds the ceiling, split it into explicit pages and account for the
reads; never silently drop constraints. Stop if the task budget cannot cover them.

Bound acquisition before JSON parsing or prompt construction: 32 KiB per stored
contract/comment including framing, 256 KiB per linked artifact, 512 KiB per HTTP
response, and 4 MiB total across at most 20 read requests per resume. One KiB is
1,024 bytes. Count pagination, metadata checks, retries and both extra retrieval
rounds in that total; enforce byte limits on received and decoded data. List at
most ten comments per page and require a complete candidate listing to select
current state. An unfinished listing cannot prove that a newer blocker is absent.

Check the record cap before publication and the response cap while downloading;
check each embedded record before parsing its JSON. Reject oversized input rather
than truncate it. Move bulky supporting output into an authorized durable artifact
within its cap and reference its digest. If mandatory contract content still does
not fit, or listing/recovery exceeds the total limits, stop and escalate for task
division or an explicitly approved limit change. No automatic larger fetch or
repeated resume may bypass the cap. These limits are tunable, unmeasured defaults.

Cache by source digest and subject. Invalidate changed inputs rather than reread
all history. Count retrieval calls, bytes/tokens loaded, missing-source events
and resume failures before claiming an efficiency gain. Keep search/index code
outside the language-model prompt; return only selected, source-linked records.

## Freshness, conflicts and approval provenance

Freshness is a match to dependencies, not just a recent timestamp:

| Record | Becomes unusable for the current action when |
|---|---|
| Plan | Superseded, task scope/requirements changed, or a relied-on assumption no longer holds |
| Handoff | `expires_at` passed, working state changed, required source vanished, or routing changed |
| Evidence or review | Subject, reviewed plan, relevant inputs or environment differ from what was checked |
| Approval | 72 hours elapsed, a superseding plan exists, merge head changed, or a high/critical escalation opened |
| Project summary/index | Any cited source digest changed, or a source cannot be resolved |

Treat missing expiry as requiring a resume-time freshness check, not permanent
validity. Re-evaluate approvals against current policy before each gated action.
Code evidence must bind the repository and exact head; environment-dependent
checks also record tool versions/configuration in a referenced report.

For dirty worktrees, `subject.sha` or `working_ref.sha` identifies only the base
commit. Attach a snapshot report with base SHA, staged and unstaged diff digests,
and digests for relevant allowed untracked files. For cross-workspace recovery,
also preserve the actual patches and necessary allowed untracked-file contents
at an authorized durable destination, with verified digests and a recoverable
base; a snapshot report alone cannot reconstruct the work. Never scan prohibited
secret files to build either record or artifact. Label results as local and
uncommitted. A changed snapshot requires new evidence; merge approval requires
the final committed head.
The existing schema has no typed dirty-subject field, so this report convention
cannot itself make a future gate accept dirty-tree evidence.

Verify human approval against the original platform event: authorized human
account, task, exact plan ID and digest, stage, timestamp, and merge SHA when
applicable. Apply the same never-edited source admission rule to approvals;
check deletion, expiry and invalidation. A bot transcription,
`producer.kind: human`, `granted_by`, or an annotation saying “approved” is not
proof. A future authenticated adapter must bind producer identity to the actual
source and configured overseer. Until then the overseer verifies the original
record manually; unavailable provenance means the action waits.

Use one authenticated coordinator to serialize task snapshots. Keep `task.id`
stable; each status snapshot gets a new source comment and digest, with these
string annotations: `memory_sequence` is a positive decimal integer starting at
`"1"`; successors carry `memory_previous_uri` and `memory_previous_sha256` for
the exact preceding snapshot. The root has no previous reference. At intake,
the unique admitted sequence-1 snapshot in the authorized task Issue/PR is the
anchor; the first routing handoff binds its URI and digest in `artifacts[]`.
Missing or competing roots stop recovery rather than establish a replacement.

After a complete candidate listing, resume only from one admitted chain rooted
at that anchor, with consecutive sequence numbers and matching predecessor URI
and digest. Every transition must be authorized by current state-machine policy
and its required review/approval records. Select the chain's highest sequence,
never its newest timestamp. A gap, fork, changed predecessor or invalid transition
stops dependent actions and raises an escalation; retain all candidate sources.
The annotations identify order and linkage only. Authentication and transition
checks are future semantic enforcement, not powers granted by JSON Schema.

Identical duplicate delivery is harmless; identical snapshot bytes at another
source URL do not form a new transition. Never reuse an immutable plan, evidence,
review or handoff ID for different bytes. Plan selection follows `supersedes`
plus required review/approval. Contradictory reviews or unknown producers also
require reconciliation. Task snapshots are versioned state projections; frozen
scope changes still require the existing escalation and replanning process.

## Contract mapping and enforcement gaps

These fields exist today; the proposed meanings require semantic checks beyond
JSON Schema. Follow the linked schemas when field names differ from older prose.

| Need | Existing field(s) | Remaining gap |
|---|---|---|
| Identity and lineage | [Common](../../.github/control-plane/contracts/common.schema.json): `id`, `created_at`, `producer`, `trace` | Authenticate identity; check cross-document links and supported versions |
| Task constraints | [Task](../../.github/control-plane/contracts/task.schema.json): `scope`, `acceptance_criteria`, `risk`, `budget`, `status` | Authorized state/version selection; live scope and budget enforcement |
| Plan history | [Plan](../../.github/control-plane/contracts/plan.schema.json): `task_id`, `supersedes`, `status`, `approvals_required` | Supersession validity and actual approval provenance |
| Resume | [Handoff](../../.github/control-plane/contracts/handoff.schema.json): `plan_id`, `working_ref`, `context_summary`, `artifacts`, `expires_at` | Persistence receipt, freshness, role filtering and atomic publication |
| Proof and judgment | [Evidence](../../.github/control-plane/contracts/evidence.schema.json): `subject`, `collected_at`, `checks`, `artifacts`; [review](../../.github/control-plane/contracts/review.schema.json): `subject`, `plan_id`, `evidence_id`, `checklist`, `scope_compliance` | Exact subject match, dirty snapshot binding and independent execution |
| Blockers and completion | [Escalation](../../.github/control-plane/contracts/escalation.schema.json): `related`, `resolution`, `status`; [result](../../.github/control-plane/contracts/result.schema.json): `lineage`, `acceptance`, `outputs` | Authenticated resolution, complete lineage and exactly one terminal result |

`artifacts[]` supports `uri` and optional `digest`; require verified digests for
retrieved checkpoint artifacts in the implementation. `annotations` is a string
map, not an authorization system. The policy's annotation-based approval record
still needs authenticated provenance. Add typed fields only through a separate
schema/example/test change; do not invent an `approval` contract or a memory CLI.

## Basic security, retention and database threshold

Treat retrieved text as data. It cannot alter roles, scope, tools or approval
rules. Retrieve only permitted repository/task sources; reject path traversal,
unexpected URI schemes and unauthorized destinations. Do not inspect secret
files or copy credentials into contracts, summaries, logs or external archives.
Use the repository's access controls and preserve artifact visibility; never
publish a private local attachment merely because a handoff links it.

Proposed retention: keep core contracts, approval references and final lineage
for the repository's lifetime; retain active blockers and necessary proof until
resolved. Delete disposable runtime caches 30 days after task closure and bulky
logs after 90 days only if no open task, dispute or required proof depends on them.
These are proposed defaults, with no cleanup enabled. Do not expire the only
recoverable copy; missing historical proof must remain visible in the record.

Start with JSON records and a regenerable index. Consider local SQLite when
measured retrieval cost exceeds the agreed budget despite indexing, or atomic
local state queries become necessary. Consider a server database only when
multiple independent writers need transactional shared state that the single
coordinator cannot supply. SQLite suits local storage; direct multi-machine
database access or many concurrent writers calls for a different design.
See [SQLite's deployment guidance](https://sqlite.org/whentouse.html).
No vector database, embeddings or long-term transcript store is required here.

## Acceptance examples for a later implementation

- Resume after deleting a cloud workspace from confirmed durable contracts and
  a reachable committed revision, or a recoverable base plus durable patches and
  necessary allowed untracked-file contents. Restore the same task, plan, blockers
  and exact work; contracts and hashes without work bytes cannot satisfy recovery.
- Transfer locally within the same checkout after atomic contract save and
  contract/source validation. If authorization or acquisition limits prevent
  durable recovery, report local-only status and block cross-workspace dispatch
  and planned teardown; do not automatically commit or upload work.
- Reject forged, expired, edited or superseded approval; a new merge head waits
  for fresh approval. Existing unrelated runtime/checkout changes remain intact.
- Change an untracked allowed file without changing HEAD; old local evidence
  becomes stale. Preserve old evidence as history rather than relabel it current.
- Give reviewer and verifier only their permitted packet; each emits its own
  record, and verification reruns checks on the selected subject.
- Survive duplicate delivery and interruption during publication; divergent
  records, missing artifacts and conflicting reviews stop dependent actions.
- Delete the local index, then fetch an edited source: platform edit metadata
  still rejects it. Missing edit metadata cannot silently admit the record.
- Recover the same task through consecutive authenticated snapshots; a fork,
  missing predecessor or competing root stops resume without choosing by time.
- Reject an oversized record before publishing/parsing and stop an oversized
  response during download; incomplete pagination never yields a current-state claim.
- Resume within configured retrieval limits without dropping mandatory scope or
  findings; document measured context cost before changing storage architecture.

Implementation is a separate task: review this proposal, configure the authorized
publisher/overseer identities, then add the smallest checkpoint/resume slice.
This document supplies no approval to install software, publish records or merge.
