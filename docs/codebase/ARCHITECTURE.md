# Architecture

## Core Sections (Required)

### 1) Architectural Style

- Primary style: Contract-driven, declarative control plane with an adversarial agent team loop and pure plan/apply settings reconciliation.
- Why this classification:
  - Trust boundary is strictly enforced at the contract level: all inter-role communications use closed JSON Schema 2020-12 documents ([ADR 0001](file:///var/home/cb/src/esp32p4/docs/decisions/0001-node-runtime-and-closed-contracts.md)).
  - Settings reconciliation follows Infrastructure-as-Code patterns: pure `plan(desired, actual)` functions calculate deterministic diffs, and mutations require explicit confirmation ([src/lib/settings/index.js](file:///var/home/cb/src/esp32p4/src/lib/settings/index.js)).
  - Team collaboration is structurally adversarial: roles are strictly separated (implementer, reviewer, security auditor, verifier), each holding non-overlapping responsibilities, with the human overseer as the ultimate authority ([README.md](file:///var/home/cb/src/esp32p4/README.md#L3-L60), [docs/architecture/adversarial-loop.md](file:///var/home/cb/src/esp32p4/docs/architecture/adversarial-loop.md)).
- Primary constraints:
  - Host and runner immutability: zero native compile step, runs in plain Node.js ESM ([ADR 0001](file:///var/home/cb/src/esp32p4/docs/decisions/0001-node-runtime-and-closed-contracts.md)).
  - Strict dependency budget: exactly three runtime dependencies (`ajv`, `ajv-formats`, `yaml`).
  - Separation of duties: no role may review, verify, or merge its own changes ([AGENTS.md](file:///var/home/cb/src/esp32p4/AGENTS.md#L98)).

### 2) System Flow

```text
[Task Intake / Issue]
       │
       ▼
[Coordinator: task contract] ──────────► [Planner: plan contract]
                                                │ (bootstraps docs/codebase/)
                                                ▼
                                         [Reviewer: plan review]
                                                │
                 ┌──────────────────────────────┴──────────────────────────────┐
                 │ (Risk Low / Normal)                                         │ (High / Critical / Sensitive Paths)
                 ▼                                                             ▼
       [Implementer / Rust-Coder: handoff]                            [Human Overseer Approval]
                 │                                                             │
                 ▼                                                             ▼
       [Evidence Collector] ◄──────────────────────────────────────────────────┘
                 │
                 ▼
       [Reviewer & Security Auditor: code & security reviews]
                 │
                 ▼
       [Verifier: independent evidence & verification review]
                 │
                 ▼
       [Human Overseer: merge decision]
                 │
                 ▼
       [Coordinator: result contract]
```

Step-by-step description:

1. **Intake & Task Validation**: An issue or prompt creates a task document adhering to [.github/control-plane/contracts/task.schema.json](file:///var/home/cb/src/esp32p4/.github/control-plane/contracts/task.schema.json). The coordinator validates the task using `src/lib/contracts.js` (`task_valid` gate).
2. **Planning & Adversarial Plan Review**: The planner first inspects or generates `docs/codebase/` using `acquire-codebase-knowledge`, then produces a `plan` document ([.github/control-plane/contracts/plan.schema.json](file:///var/home/cb/src/esp32p4/.github/control-plane/contracts/plan.schema.json)). An independent reviewer examines the plan and issues a `review` contract with `review_kind: "plan"` ([.github/control-plane/contracts/review.schema.json](file:///var/home/cb/src/esp32p4/.github/control-plane/contracts/review.schema.json)).
3. **Approval Gate Evaluation**: The control plane evaluates [.github/control-plane/policies/approvals.yaml](file:///var/home/cb/src/esp32p4/.github/control-plane/policies/approvals.yaml) via `src/lib/orchestration.js`. If the task touches sensitive paths or has high/critical risk, it enters `awaiting_approval` for human overseer sign-off.
4. **Implementation & Evidence Gathering**: The implementer (or `rust-coder` for firmware) makes changes strictly bounded by `task.scope.allowed_paths` ([AGENTS.md](file:///var/home/cb/src/esp32p4/AGENTS.md#L94)). The evidence collector invokes `src/evidence.js` to build an `evidence` contract ([.github/control-plane/contracts/evidence.schema.json](file:///var/home/cb/src/esp32p4/.github/control-plane/contracts/evidence.schema.json)), asserting that `out_of_scope_paths` is empty and token usage is within budget.
5. **Adversarial Code & Security Review**: The reviewer and security auditor evaluate the code and evidence against domain rules ([src/review-domains.js](file:///var/home/cb/src/esp32p4/src/review-domains.js)), emitting distinct `review` contracts (`review_kind: "code"` and `"security"`).
6. **Verification & Human Merge Gate**: The verifier independently re-executes tests and checks to produce verification evidence. Once all reviews approve and verification passes, the task moves to `awaiting_approval`. The human overseer makes the final merge decision. Upon merge, the coordinator records a terminal `result` contract ([.github/control-plane/contracts/result.schema.json](file:///var/home/cb/src/esp32p4/.github/control-plane/contracts/result.schema.json)).

### 3) Layer/Module Responsibilities

| Layer or module | Owns | Must not own | Evidence |
|-----------------|------|--------------|----------|
| `src/lib/contracts.js` | Schema caching, `$ref` resolution, document schema validation | Business logic, state transitions, HTTP I/O | [src/lib/contracts.js](file:///var/home/cb/src/esp32p4/src/lib/contracts.js) |
| `src/lib/orchestration.js` | Parsing state machines and policies, checking enum invariants, path glob matching | Mutating GitHub resources, executing transitions directly | [src/lib/orchestration.js](file:///var/home/cb/src/esp32p4/src/lib/orchestration.js) |
| `src/lib/settings/` | Plan/apply reconciliation for repository settings (labels, rulesets) | Schema compilation, contract state tracking | [src/lib/settings/index.js](file:///var/home/cb/src/esp32p4/src/lib/settings/index.js) |
| `src/lib/github.js` | HTTP communication with GitHub REST API, retries, exponential backoff | Contract validation, parsing policies | [src/lib/github.js](file:///var/home/cb/src/esp32p4/src/lib/github.js) |
| `src/evidence.js` | Computing out-of-scope diffs, validating budget ceilings, constructing evidence envelopes | Merging PRs, executing workflows | [src/evidence.js](file:///var/home/cb/src/esp32p4/src/evidence.js) |
| `src/compaction.js` | Semantic log chunking and scoring to preserve test failure context | Direct test execution, network calls | [src/compaction.js](file:///var/home/cb/src/esp32p4/src/compaction.js) |
| `src/review-domains.js` | Domain routing: selecting between JS control-plane rules and Rust `#![no_std]` firmware rules | Modifying code, granting PR approvals | [src/review-domains.js](file:///var/home/cb/src/esp32p4/src/review-domains.js) |

### 4) Reused Patterns

| Pattern | Where found | Why it exists |
|---------|-------------|---------------|
| Pure Planner (`plan(desired, actual)`) | [src/lib/settings/labels.js](file:///var/home/cb/src/esp32p4/src/lib/settings/labels.js#L54), [src/lib/settings/rulesets.js](file:///var/home/cb/src/esp32p4/src/lib/settings/rulesets.js#L68) | Keeps reconciliation deterministic and easily testable without network mocking. |
| Closed Contracts (`unevaluatedProperties: false`) | [.github/control-plane/contracts/](file:///var/home/cb/src/esp32p4/.github/control-plane/contracts/) | Prevents agents from smuggling unapproved data or bypassing security controls. Enforced by [tests/security/contracts-strictness.test.js](file:///var/home/cb/src/esp32p4/tests/security/contracts-strictness.test.js). |
| Mandatory Mutation Flag (`--yes`) | [src/cli.js](file:///var/home/cb/src/esp32p4/src/cli.js#L66), [src/lib/settings/index.js](file:///var/home/cb/src/esp32p4/src/lib/settings/index.js) | Guarantees that write operations to live repositories are never executed inadvertently. |
| Tri-state Exit Codes | [src/cli.js](file:///var/home/cb/src/esp32p4/src/cli.js#L20) | Distinguishes between clean success (`0`), runtime failure (`1`), and drift/invalid validation (`2`). |

### 5) Known Architectural Risks

- Human overseer bottleneck: High-risk tasks and every PR merge require explicit human intervention. If the overseer is unresponsive, the pipeline stalls at `awaiting_approval` ([docs/runbooks/overseer.md](file:///var/home/cb/src/esp32p4/docs/runbooks/overseer.md)).
- Manual vs. automated control gap: While contracts, state machine definitions, and policies are fully specified, the automated dispatcher is not yet running in GitHub Actions; the team operates manually ([PROJECT.md](file:///var/home/cb/src/esp32p4/PROJECT.md#L5-L10)).
- Model diversity assumption: The adversarial model requires distinct model families for implementer and reviewer to avoid common failure modes ([AGENTS.md](file:///var/home/cb/src/esp32p4/AGENTS.md#L112-L115)). In environments where only a single model provider is available, reviewer independence is compromised.

### 6) Evidence

- [docs/architecture/adversarial-loop.md](file:///var/home/cb/src/esp32p4/docs/architecture/adversarial-loop.md)
- [docs/architecture/contracts.md](file:///var/home/cb/src/esp32p4/docs/architecture/contracts.md)
- [.github/control-plane/orchestration/state-machine.yaml](file:///var/home/cb/src/esp32p4/.github/control-plane/orchestration/state-machine.yaml)
- [.github/control-plane/policies/approvals.yaml](file:///var/home/cb/src/esp32p4/.github/control-plane/policies/approvals.yaml)
- [src/lib/settings/index.js](file:///var/home/cb/src/esp32p4/src/lib/settings/index.js)
- [tests/security/contracts-strictness.test.js](file:///var/home/cb/src/esp32p4/tests/security/contracts-strictness.test.js)

## Extended Sections (Optional)

### 7) The Planner Agent Pipeline & Knowledge Lifecycle

The planning agent ([.github/agents/planner.agent.md](file:///var/home/cb/src/esp32p4/.github/agents/planner.agent.md)) is architected around a two-phase loop:

```text
Incoming Task ──► Phase 1: Establish Knowledge ──► Phase 2: Formulate Plan ──► Handoff to Reviewer
                         │                                │
                         ▼                                ▼
                 docs/codebase/                   plan.schema.json
                 (7 documents via                 (or plain language
                 acquire-codebase-knowledge)      agreement)
```

1. **Pre-Planning Knowledge Verification**:
   - The planner reads [docs/codebase/](file:///var/home/cb/src/esp32p4/docs/codebase). If knowledge documents are missing or stale, it runs the scanner (`scan.py`) and checks current files.
   - It cross-references claims against current AST callers and tests, treating docs as a map rather than infallible truth.
2. **Plan Synthesis**:
   - Decomposes work into small sequential steps with explicit file paths and rollback steps.
   - Declares required acceptance checks, distinguishing between commands proposed vs commands actually executed.
3. **Adversarial Handoff**:
   - Hands off directly to `reviewer` for plan critique (`review_kind: "plan"`), or escalates to `coordinator` if a blocking decision or scope expansion is encountered.

### 8) State-Machine Invariants & Guardrails

The state machine ([.github/control-plane/orchestration/state-machine.yaml](file:///var/home/cb/src/esp32p4/.github/control-plane/orchestration/state-machine.yaml)) enforces five foundational invariants:
1. `separation_of_duties`: The producer of a plan, change, or evidence document never reviews, audits, verifies, or approves it.
2. `distinct_review_model`: Review roles run on a different model family than the implementer (e.g. Claude 3.7 Sonnet reviewing GPT-5.6-Luna).
3. `human_only_approvals`: `approval_granted` is satisfied only by producer kind `human`.
4. `halt_is_total`: A halt immediately terminates all roles, each emitting a handoff and pausing execution.
5. `no_silent_scope_change`: Any scope expansion requires human escalation and a new reviewed plan before work resumes.

### 9) Downstream Hardware Wallet Target Alignment

The control plane is specifically tailored to govern the upcoming embedded firmware mission:
- **Domain Checklist Isolation**: [.review-domains.json](file:///var/home/cb/src/esp32p4/.review-domains.json) configures a dedicated `firmware` domain for `firmware/**/*.rs` that requires `#![no_std]` compliance, zero heap allocations on the secret path, zero panics on untrusted camera/QR input, and zeroization of secret keys on drop.
- **Role Specialization**: The `rust-coder` agent profile ([.github/agents/rust-coder.agent.md](file:///var/home/cb/src/esp32p4/.github/agents/rust-coder.agent.md)) is configured with the `rust-coder.instructions.md` ruleset, ensuring it operates within strict embedded security boundaries when building for the Waveshare ESP32-P4 board.
