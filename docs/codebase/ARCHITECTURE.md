# Architecture

## Core Sections (Required)

### 1) Architectural Style

- Primary style: Contract-driven, declarative control plane with an adversarial agent team loop and pure plan/apply settings reconciliation.
- Why this classification:
  - The formal process uses closed JSON Schema 2020-12 documents; ordinary owner-directed handoffs use the plain-language agreement in AGENTS.md ([ADR 0001](../../docs/decisions/0001-node-runtime-and-closed-contracts.md)).
  - Settings reconciliation follows Infrastructure-as-Code patterns: pure `plan(desired, actual)` functions calculate deterministic diffs, and mutations require explicit confirmation ([src/lib/settings/index.js](../../src/lib/settings/index.js)).
  - Team collaboration is structurally adversarial: roles are strictly separated (implementer, reviewer, security auditor, verifier), each holding non-overlapping responsibilities, with the human overseer as the ultimate authority ([README.md](../../README.md), [docs/architecture/adversarial-loop.md](../../docs/architecture/adversarial-loop.md)).
- Primary constraints:
  - Host and runner immutability: zero native compile step, runs in plain Node.js ESM ([ADR 0001](../../docs/decisions/0001-node-runtime-and-closed-contracts.md)).
  - Strict dependency budget: exactly three runtime dependencies (`ajv`, `ajv-formats`, `yaml`).
  - Separation of duties: no role may review, verify, or merge its own changes ([AGENTS.md](../../AGENTS.md)).

### 2) Proposed automated system flow

This diagram describes the formal target process. Current handoffs are owner-directed; the declarations do not run a dispatcher.

```text
Task intake -> Planner -> Independent plan review
                              |
                    Evaluate approval policy
                    (risk, tags and paths)
                              |
                Human plan approval when required
                              |
                   Implementer / Rust coder
                              |
                     Implementation evidence
                              |
                 Code review + required security audit
                              |
                    Independent verification
                              |
                       Human merge decision
                              |
                         Result record
```

Step-by-step description:

1. **Intake & Task Validation**: An issue or prompt creates a task document adhering to [.github/control-plane/contracts/task.schema.json](../../.github/control-plane/contracts/task.schema.json). The coordinator validates the task using `src/lib/contracts.js` (`task_valid` gate).
2. **Planning & Adversarial Plan Review**: The planner first inspects or generates `docs/codebase/` using `acquire-codebase-knowledge`, then produces a `plan` document ([.github/control-plane/contracts/plan.schema.json](../../.github/control-plane/contracts/plan.schema.json)). An independent reviewer examines the plan and issues a `review` contract with `review_kind: "plan"` ([.github/control-plane/contracts/review.schema.json](../../.github/control-plane/contracts/review.schema.json)).
3. **Approval Gate Evaluation**: The control plane evaluates [.github/control-plane/policies/approvals.yaml](../../.github/control-plane/policies/approvals.yaml) via `src/lib/orchestration.js`. If the task has matching sensitive paths or tags, or high/critical risk, it enters `awaiting_approval` for human overseer sign-off.
4. **Implementation & Evidence Gathering**: The implementer (or `rust-coder` for firmware) makes changes strictly bounded by `task.scope.allowed_paths` ([AGENTS.md](../../AGENTS.md)). The evidence collector invokes `src/evidence.js` to build an `evidence` contract ([.github/control-plane/contracts/evidence.schema.json](../../.github/control-plane/contracts/evidence.schema.json)), reporting scope and measured budget results; those results do not authorize a state transition.
5. **Adversarial Code & Security Review**: The reviewer and security auditor evaluate the code and evidence against domain rules ([src/review-domains.js](../../src/review-domains.js)), emitting distinct `review` contracts (`review_kind: "code"` and `"security"`).
6. **Verification & Human Merge Gate**: The verifier independently re-executes tests and checks to produce verification evidence. Once all reviews approve and verification passes, the task moves to `awaiting_approval`. The human overseer makes the final merge decision. Upon merge, the coordinator records a terminal `result` contract ([.github/control-plane/contracts/result.schema.json](../../.github/control-plane/contracts/result.schema.json)).

### 3) Layer/Module Responsibilities

| Layer or module | Owns | Must not own | Evidence |
|-----------------|------|--------------|----------|
| `src/lib/contracts.js` | Schema caching, `$ref` resolution, document schema validation | Business logic, state transitions, HTTP I/O | [src/lib/contracts.js](../../src/lib/contracts.js) |
| `src/lib/orchestration.js` | Parsing state machines and policies, checking enum invariants, path glob matching | Mutating GitHub resources, executing transitions directly | [src/lib/orchestration.js](../../src/lib/orchestration.js) |
| `src/lib/settings/` | Plan/apply reconciliation for repository settings (labels, rulesets) | Schema compilation, contract state tracking | [src/lib/settings/index.js](../../src/lib/settings/index.js) |
| `src/lib/github.js` | HTTP communication with GitHub REST API, retries, exponential backoff | Contract validation, parsing policies | [src/lib/github.js](../../src/lib/github.js) |
| `src/evidence.js` | Computing out-of-scope diffs, validating budget ceilings, constructing evidence envelopes | Merging PRs, executing workflows | [src/evidence.js](../../src/evidence.js) |
| `src/compaction.js` | Semantic log chunking and scoring to preserve test failure context | Direct test execution, network calls | [src/compaction.js](../../src/compaction.js) |
| `src/review-domains.js` | Domain routing: selecting between JS control-plane rules and Rust `#![no_std]` firmware rules | Modifying code, granting PR approvals | [src/review-domains.js](../../src/review-domains.js) |

### 4) Reused Patterns

| Pattern | Where found | Why it exists |
|---------|-------------|---------------|
| Pure Planner (`plan(desired, actual)`) | [src/lib/settings/labels.js](../../src/lib/settings/labels.js), [src/lib/settings/rulesets.js](../../src/lib/settings/rulesets.js) | Keeps reconciliation deterministic and easily testable without network mocking. |
| Closed Contracts (`unevaluatedProperties: false`) | [.github/control-plane/contracts/](../../.github/control-plane/contracts/) | Rejects undeclared properties; it does not authenticate approvals or make arbitrary strings safe. Enforced by [tests/security/contracts-strictness.test.js](../../tests/security/contracts-strictness.test.js). |
| Mandatory Mutation Flag (`--yes`) | [src/cli.js](../../src/cli.js), [src/lib/settings/index.js](../../src/lib/settings/index.js) | Requires explicit confirmation for settings mutations; authorization still comes from the owner. |
| Tri-state Exit Codes | [src/cli.js](../../src/cli.js) | Distinguishes between clean success (`0`), runtime failure (`1`), and drift/invalid validation (`2`). |

### 5) Known Architectural Risks

- Human overseer bottleneck: High-risk tasks and every PR merge require explicit human intervention. If the overseer is unresponsive, the pipeline stalls at `awaiting_approval` ([docs/runbooks/overseer.md](../../docs/runbooks/overseer.md)).
- Manual vs. automated control gap: While contracts, state machine definitions, and policies are fully specified, the automated dispatcher is not yet running in GitHub Actions; the team operates manually ([PROJECT.md](../../PROJECT.md)).
- Review independence: use a separate reviewer. Ordinary work permits the same model family when another is unavailable; security-critical review requires a different family.

### 6) Evidence

- [docs/architecture/adversarial-loop.md](../../docs/architecture/adversarial-loop.md)
- [docs/architecture/contracts.md](../../docs/architecture/contracts.md)
- [.github/control-plane/orchestration/state-machine.yaml](../../.github/control-plane/orchestration/state-machine.yaml)
- [.github/control-plane/policies/approvals.yaml](../../.github/control-plane/policies/approvals.yaml)
- [src/lib/settings/index.js](../../src/lib/settings/index.js)
- [tests/security/contracts-strictness.test.js](../../tests/security/contracts-strictness.test.js)

## Extended Sections (Optional)

### 7) The Planner Agent Pipeline & Knowledge Lifecycle

The planning agent ([.github/agents/planner.agent.md](../../.github/agents/planner.agent.md)) is architected around a two-phase loop:

```text
Incoming Task ──► Phase 1: Establish Knowledge ──► Phase 2: Formulate Plan ──► Handoff to Reviewer
                         │                                │
                         ▼                                ▼
                 docs/codebase/                   plan.schema.json
                 (7 documents via                 (or plain language
                 acquire-codebase-knowledge)      agreement)
```

1. **Pre-Planning Knowledge Verification**:
   - The planner reads [docs/codebase/](../../docs/codebase). If knowledge documents are missing or stale, it runs the scanner (`scan.py`) and checks current files.
   - It cross-references claims against current AST callers and tests, treating docs as a map rather than infallible truth.
2. **Plan Synthesis**:
   - Decomposes work into small sequential steps with explicit file paths and rollback steps.
   - Declares required acceptance checks, distinguishing between commands proposed vs commands actually executed.
3. **Adversarial Handoff**:
   - Hands off directly to `reviewer` for plan critique (`review_kind: "plan"`), or escalates to `coordinator` if a blocking decision or scope expansion is encountered.

### 8) State-Machine Invariants & Guardrails

The state machine ([.github/control-plane/orchestration/state-machine.yaml](../../.github/control-plane/orchestration/state-machine.yaml)) declares seven invariants for the future automated process. No running dispatcher enforces these transitions:
1. `separation_of_duties`: The producer of a plan, change, or evidence document never reviews, audits, verifies, or approves it.
2. `distinct_review_model`: Prefer different model families; follow the model-family requirements in [ADR 0003](../decisions/0003-agent-operating-limits.md).
3. `human_only_approvals`: `approval_granted` is satisfied only by producer kind `human`.
4. `halt_is_total`: The intended process stops all roles. Today, inspect and stop actual workers separately; a halt comment does not terminate processes.
5. `one_result`: The intended process emits one result when a task enters a terminal state.
6. `overseer_note_present`: Review, result and escalation records require a plain-language owner note.
7. `no_silent_scope_change`: Any scope expansion requires human escalation and a new reviewed plan before work resumes.

### 9) Downstream Hardware Wallet Target Alignment

The reusable control plane includes guidance for the later firmware project:
- **Domain Checklist Isolation**: [.review-domains.json](../../.review-domains.json) configures a dedicated `firmware` domain for `firmware/**/*.rs` that requires `#![no_std]` compliance, zero heap allocations on the secret path, zero panics on untrusted camera/QR input, and zeroization of secret keys on drop.
- **Role Specialization**: The `rust-coder` agent profile ([.github/agents/rust-coder.agent.md](../../.github/agents/rust-coder.agent.md)) is configured with the `rust-coder.instructions.md` ruleset, providing embedded guidance. The exact board and protocol remain unverified; a profile does not enforce isolation.
