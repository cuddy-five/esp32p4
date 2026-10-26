# Section one: Jev and agentic control-plane roadmap

Status: draft for shared-understanding review. This is not an approved execution plan or authorization to publish tickets, install software, or change GitHub settings.

## Outcome

An overseer approves a scoped plan in GitHub, then isolated local specialists implement, test, independently review, and repair work within enforced limits. The system produces an evidence-backed merge decision for the human. Demonstrate readiness for representative Rust no_std work before starting the wallet firmware.

Owner decisions are recorded in [ADR 0003](../decisions/0003-bounded-jev-authority.md). Section one must prepare and evaluate wallet-specific specialist routines; production firmware implementation belongs to section two. Exact hardware and protocol facts must be researched before encoding them in skills.

## Purpose-built specialist routines

Each role gets a small core skill/tool set and a few optional tools selected for plausible adjacent needs. Record why each tool is present, when it should be used, and the permissions it needs. Keep optional references available on demand instead of loading every skill into every task. Remove or revise tools that do not demonstrate value in representative exercises.

Prefer light customization of strong upstream skills: preserve provenance and license, record the upstream revision and local changes, and add concise repository-specific instructions and linked references. Keep common facts in shared references so specialist instructions do not drift. Do not activate learned or generated skills without owner review.

Proposed routine coverage, to be refined against verified specifications:

| Specialist focus | Repo-specific checks and evidence |
| --- | --- |
| Rust no_std firmware | Target/build compatibility, dependency features, unintended std or allocation assumptions, panic paths, integer bounds, unsafe invariants, stack/memory limits, interrupt and DMA ownership |
| Cryptography and Bitcoin fork | Exact Blake2b variant/parameters, UNIFIED_SIGHASH specification, serialization and byte order, transaction parsing, key/seed lifetime, signing behavior, independently sourced test vectors |
| ESP32P4 peripherals | Verified board and camera interfaces, buffer sizes/lifetimes, memory placement, frame handling, peripheral errors, LCD/touch behavior, device-level evidence where required |
| Wallet interaction | Review-before-signing flow, displayed values matching the transaction being signed, cancellation, stateless session cleanup, camera/QR parsing bounds if QR is selected |
| Independent verification | Reproduce builds/checks on the reviewed revision, distinguish host tests from target/device evidence, seed representative defects and confirm detection |

Target requirements are Rust no_std, stateless operation, air-gapped use, Blake2b, UNIFIED_SIGHASH, ESP32P4 Touch with 3.5-inch LCD and 5MP camera, and no Wi-Fi/BLE. Verify exact board revision, camera module and radio components. Evaluate physical removal versus firmware exclusion with evidence; do not assume omitting radio APIs proves physical isolation.

Study Coldcard, SeedSigner, Krux, and applicable privkeyio forks for useful architecture, signing/display flows, optical transport, testing, and failure handling. Identify exact repositories and revisions, distinguish upstream behavior from fork changes, and check licensing before adapting code. Do not assume they share this fork's signing rules or this board's hardware capabilities.

## Proposed sequence

1. **Establish the actual worker and tool capabilities.** Reconcile PROJECT.md with current implementation and owner requirements. Verify a supported local Copilot execution path, available model families, role-specific skills/MCP access, and isolated execution. Identify a suitable independent security reviewer. Produce a capability matrix distinguishing configured, documented, and demonstrated behavior. Automatic provider fallback is deferred.
2. **Complete Jev routing and measurement.** Preserve current shared-state question batching. Evaluate specialist/workflow selection, uncertainty handling, and useful tool selection. Record per-call usage and enforce an explicit evaluation cap within verified remaining prepaid credit. Compare cost, latency, quality, and unsafe misses across useful alternatives; avoid unnecessary calls and claims of optimality without evidence.
3. **Run one complete engineering task.** Implement durable task state, role handoffs, artifact tracking, actual worker dispatch, authenticated plan approval and scope enforcement. Exercise planner, implementer, reviewer, security auditor where required, and verifier against the same identified revision. Finish with a human merge decision packet.
4. **Make routine operation dependable.** Enforce two repair rounds, one implementation task at a time, parallel independent reviews, and one adjudication attempt. Handle tool absence, authentication failure, quota exhaustion, timeouts, bad output, failed checks, and exhausted limits. Add observed halt/resume and local emergency stop. Use a small set of fundamental hostile-input checks.
5. **Prove recovery and Rust readiness.** Exercise worker interruption, duplicate task delivery, stale approvals/reviews after changes, and uncertain outcomes of external actions. Demonstrate representative Rust no_std build/test/review tasks and detection of seeded defects using no real wallet keys. Validate that recovery neither duplicates side effects nor advances without required evidence.
6. **Review readiness with the overseer.** Present measured outcomes, limitations, outstanding blockers, and a final role/tool/workflow matrix. Begin section two only after the owner accepts the evidence. Defer broader provider fallback, increased concurrency, and expanded autonomous authority until they are justified.

## Acceptance emphasis

Most effort goes to correct functionality, specialist competence, effective tools, usable workflows, and likely operational failures. Advanced failure coverage is selective. The foundational permission and approval checks remain mandatory throughout.

## Facts to resolve before execution plans

- Supported local worker interfaces and actual subscription/model availability.
- How each worker receives skills, MCP tools, context, and constrained permissions.
- The verified remaining Jev balance, explicit cap, usage pricing/accounting, and evaluation size.
- Exact acceptance cases, numerical routing targets, task time limits, and recovery evidence.
- Appropriate Rust no_std tooling and representative exercises; these do not settle wallet protocol or hardware design.
- Exact reference-wallet repositories/forks, protocol specifications and test vectors; exact board/camera revision and radio exclusion evidence.

Resolve accessible technical facts through inspection and official documentation. Bring genuine owner tradeoffs back to the interview. Every implementation milestone still needs scoped task/plan contracts and the existing independent review process.
