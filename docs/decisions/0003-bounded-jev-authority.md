# ADR 0003: Bounded Jev authority

Status: accepted by the owner during the design interview; implementation pending.

Jev may drive automatic actions within owner-approved boundaries, while deterministic policy enforces permissions, scope, budgets, mandatory reviews, and approval requirements. Its delegated authority grows by decision category through measured evaluations and explicit owner approval; Jev cannot grant itself permissions or waive required checks. This enables progressively less routine supervision while the overseer retains control over authority changes, major exceptions, merges, and releases.

## Consequences

Begin with observation and evaluation, then delegate selected routing and bounded recovery decisions. Evaluate representative, held-out, and adversarial cases; confidence alone does not authorize delegation. Reevaluate relevant decisions when models, questions, or registries change, and reduce autonomy when results regress.

This records the agreed target architecture, not a claim that runtime enforcement exists. Initial execution uses isolated local workers with GitHub tasks, approvals, and CI. Numeric budgets, detailed evaluation criteria, and the complete implementation plan remain unresolved. Existing role separation, scope-expansion rules, and human merge requirements remain applicable.

## Agreed operating limits

After plan approval, the team may implement, test, review, and repair within scope and enforced limits before presenting the human merge decision. Retain separate planner, implementer, reviewer, security auditor, and verifier roles, with task-specific expertise and tools.

Start with one implementation task at a time; independent reviews may run in parallel. Allow two automatic repair rounds per task. Allow one independent adjudication attempt for conflicting reviews, then escalate unresolved disagreement to the overseer. A majority vote cannot automatically dismiss a security finding.

Use Copilot first. Additional subscription providers and automatic fallback are desired but are not prerequisites for initial operation. Existing Copilot paid usage may be consumed; no additional paid agent usage is authorized after it is exhausted.

Jev requires an explicit spending cap, whose amount and accounting period remain to be decided. Pause and notify the owner when the cap or available credit is exhausted; the owner controls refilling, and a refill does not itself raise the cap.

The owner reports an original $5 Jev balance with roughly $4 remaining. This is not a new $5 allocation. Verify the available balance before paid evaluation and record the evaluation ceiling explicitly; an approximate balance is not a verified accounting limit.

## Specialist tools and review independence

Provide each role a small, well-scoped set of high-value skills and MCP tools, plus a few justified optional capabilities for plausible adjacent tasks. Do not load a large catalogue of unused skills. Select tools by demonstrated task fit and lightly customize skills with repository-specific routines, references, commands, failure checks, and evidence requirements. Jev may choose within the approved catalogue; catalogue breadth does not expand task scope, credential access, write permissions, or external-action authority. New permissions require owner approval.

Prepare specialist routines for the intended stateless, air-gapped Bitcoin Blake2b wallet: Rust no_std, UNIFIED_SIGHASH, ESP32P4 Touch with a 3.5-inch LCD and 5MP camera, and no Wi-Fi or BLE. These are owner requirements; verify exact board revision, camera module, protocol specifications, and the means of excluding radio operation before making implementation claims. Physical removal and software omission are candidate approaches, not established equivalent guarantees.

Review typical defects in this actual environment using appropriate specialists and trusted test vectors. The small hostile-input scope for the engineering control plane does not remove firmware parser, signing, or secret-handling checks. Use Coldcard, SeedSigner, Krux, and relevant privkeyio forks as design references where applicable; verify exact upstream/fork identity, revision, license, and protocol compatibility before adapting ideas or code.

For ordinary changes, a separate reviewer using the same model family is acceptable when another family is unavailable; record that limitation. Security-critical changes, including signing, key handling, and control-plane permission enforcement, require a reviewer from a different model family. Pause that review gate if no suitable reviewer is available. Provider names alone do not establish model-family diversity, and diversity does not replace independent evidence and tests.

## Jev efficiency requirement

Section-one planning must include an efficiency assessment of Jev question batching. Group useful independent questions sharing the same state into one request; preserve sequential calls when later questions require newly obtained evidence or previous answers. Compare cost, latency, and decision quality on representative and adversarial cases before claiming an improvement. Do not replace deterministic checks or independent reviewers with additional Jev questions.

References: [parallel questions](https://docs.typesafe.ai/cookbooks/parallel_questions) and [speculative fan-out](https://docs.typesafe.ai/patterns/fan-out). The target is measured efficiency under the required quality and safety constraints; near-optimal performance is not yet established.

## Acceptance priorities and overseer interface

Prioritize functional reliability: appropriate specialists, useful tools and current workflows, successful handoffs, independent review, and demonstrated Rust no_std readiness. Evaluate capability through task outcomes rather than treating a new model, tool, or registry entry as proof of quality.

Keep hostile-input acceptance checks small and foundational. Preserve scope, approval, secret, and role boundaries; a broad adversarial research campaign is not a section-one priority. Order recovery work by estimated likelihood and impact, covering common failures first and selected advanced failures afterward. The ranking is a planning judgment until operational evidence exists.

GitHub Issues and PRs are the main overseer interface for plans, progress, escalations, evidence, and merge decisions. Provide authenticated halt/resume and a local emergency stop. A posted halt request is not proof that workers have stopped; report observed execution state.
