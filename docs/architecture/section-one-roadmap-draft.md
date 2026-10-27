# Section one: Jev and agentic control-plane roadmap

Status: the owner confirmed this roadmap and authorized publication. Individual implementation work remains separate. The owner also requested small changes to pause Jev and automated controls during manual development.

The [official GitHub roadmap](https://github.com/cuddy-five/esp32p4/issues/4) is published with seven large child issues. This document records the design; use GitHub for current work status.

Current working mode: ordinary owner-directed edits and commits do not require the full control-plane contract process. The paused workflows and current instructions are recorded in [the team runbook](../runbooks/agent-team.md#current-mode-build-the-repository-manually). The stricter controls below are targets for the future automated team.

## Outcome

An overseer approves a scoped plan in GitHub, then isolated local specialists implement, test, independently review, and repair work within enforced limits. The system produces an evidence-backed merge decision for the human. Demonstrate readiness for representative Rust no_std work before starting the wallet firmware.

Owner decisions are recorded in [ADR 0003](../decisions/0003-bounded-jev-authority.md). Section one must prepare and evaluate wallet-specific specialist routines; production firmware implementation belongs to section two. Exact hardware and protocol facts must be researched before encoding them in skills.

## What the owner decided on 2026-10-27

Build the agent team first. Then add more uses for Jev where it helps make better decisions or saves money. Each agent needs instructions, prompts, skills and access to useful tools, including MCP connections where needed. Agents must follow the control-plane rules.

The owner decides personally when the agents phase is done. Do not add a completion checklist, score or extra approval step for that decision. The existing rules for individual tasks still apply.

Combine related knowledge when it keeps the team simpler. For example, the Rust agent can also know Bitcoin. We do not need a separate agent for every subject. Planning, writing, reviewing and checking work still have separate responsibilities.

The owner chose these seven working agents, plus the Foundry that creates and improves them:

| Agent | Main job |
| --- | --- |
| Coordinator | Keeps track of work and passes it to the right agent. |
| Planner | Researches the problem and prepares a plan. |
| Control-plane engineer | Builds the agent system, its JavaScript code and GitHub workflows. |
| Wallet engineer | Combines Rust, Bitcoin and ESP32 knowledge to build the wallet software. |
| Reviewer | Independently checks plans and code for mistakes. |
| Security auditor | Looks for security problems in the system and wallet. |
| Verifier | Runs checks independently and reports what actually works. |

The two engineers both do the implementer's job under the existing rules; their areas of knowledge differ. Reviewers get the relevant wallet or control-plane knowledge for each task. The Foundry helps prepare the team rather than taking over its reviews or approvals. The starting skills and tools are recorded below.

The owner can use each agent directly or let the coordinator arrange the teamwork. Both ways use the same agent definitions and the same rules for the work being done. A direct question to an agent does not require starting the full team process.

Specialists can look up relevant information themselves. The planner handles larger research questions, while other agents can check the details they need without waiting for the planner to fetch everything.

The coordinator posts routine GitHub progress updates and collects the team's findings into a clear account of the work. Keep the author of each review visible. Other agents can publish directly when the owner specifically asks them to do so.

The owner accepted the [starting skills, tools and file layout](../plans/agent-team-skills-and-tools-draft.md). Use adapted existing skills and shared wallet references, with GitHub, Basic Memory, Context7 and NotebookLM access suited to each agent. The coordinator saves shared memory notes by default. Use normal file, search and command tools without adding duplicate MCP services. Hooks and workflows should reuse the shared control-plane rules. These choices are not yet active agent settings.

Use `docs/templates/` for examples and guidance. Edit the actual agent definitions in `.github/agents/` directly after review. The foundry should try to prepare the whole agent: instructions, prompts, skills, tool connections and the records used to pass work to the next agent. We can change any of these parts afterward. The normal review process applies to those changes.

Write this roadmap and its GitHub issues in plain language. Put the main point first, explain unfamiliar terms, and use more words when that helps the owner understand. Follow the [writing rules](../agents/domain.md#write-so-the-owner-can-understand-and-decide).

Use large GitHub issues for the roadmap. Group related work so the owner can see the major pieces without sorting through a long list of small tickets. Link those issues from a Wayfinder map, with agents first and Jev second. Create smaller tasks later when useful.

The owner accepted seven large issue groups: Foundry and agent packages; skills and tools; control-plane teamwork; dependable operation; Jev agent/workflow suggestions; Jev extra-skill suggestions; and permitted recovery choices. Use dependencies only when work truly cannot proceed without something else. Use a small label set for the area, type of work and existing intake state. The [GitHub issue drafts](../plans/agent-team-github-roadmap-draft.md) explain the next action, relevant files, GitHub steps and completion requirements for each issue in everyday language.

Opening an issue must not automatically request paid Jev analysis. The owner requested disconnecting Jev for now. The intake workflow is disabled on GitHub; its local definition now accepts manual requests only. Re-enabling paid analysis needs a later owner instruction.

The owner does not want to decide the Jev spending amount now. Leave it open for later, while preserving the existing decision to establish a cap before paid evaluation or routine spending.

After the agent team, work on Jev in this order: suggest the agent and workflow for a task; suggest useful extra skills already allowed for that agent; then consider choices among permitted recovery steps. Begin with suggestions. Each kind of automatic decision needs evaluation and the owner's approval before it is enabled. Control-plane rules continue to enforce permissions, required reviews and human decisions. Consider a second skill-selection call only if testing shows it is worthwhile.

These decisions describe what we want to build. They do not mean the team is already built. The steps below are a draft work plan; they do not decide when the owner may call the agents phase done.

## Ideas to consider from the Gemini specification

The owner supplied [this specification](../plans/esp32_p4_control_plane_hardware_wallet_specification.md) as a source of ideas. Use it alongside the owner's decisions and the current code. Its proposals are not automatically approved requirements.

- **Give reviewers guidance for the work in front of them.** Checking the agent system needs different questions from checking wallet code. Keep the same reviewer and auditor roles, but give them the relevant knowledge. The evidence command already includes code that selects review checklists; inspect what is missing before opening an issue to build it again.
- **Have the Foundry check its output.** Agent names, descriptions, tool choices and the records agents pass to each other should agree with the repository rules. A tool mentioned in a template may still need setup or may not work in the chosen application.
- **Keep test-writing knowledge in the smaller team.** The engineers can use the test-writing guidance from the proposed test specialist. The verifier still runs checks independently. The owner chose seven working agents, so the specification's extra test-specialist agent is not part of the agreed starting team.
- **Consider separating wallet logic from device control later.** The proposed `wallet-core` and `wallet-fw` split could let us test transaction logic separately from the screen, camera and other hardware. This remains a future wallet design choice, not permission to start firmware now.

Check the document's status claims before using them in issues. The current runbook says agent dispatch and approval checking are still manual. The listed model names, hardware details and radio-control method also need checking. The code's default Jev spending limit is not a spending limit chosen by the owner. Preserve the agreed order: agents first, then more Jev work, then wallet implementation.

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

1. **Build the Foundry and agent packages.** Correct PROJECT.md where it no longer matches the code or the owner's choices. Use the Foundry and relevant templates to prepare the agreed team. Check that the chosen client loads the profiles and their instructions for both direct use and coordinated work.
2. **Give agents their skills and tools.** Adapt the agreed skills and shared wallet references. Check actual model and MCP access, find a suitable independent security reviewer, and show what is configured versus what has worked. Verify hardware and protocol facts before turning them into specialist guidance.
3. **Make the team follow the control plane.** Implement durable task records, worker dispatch, role handoffs, approval checking and scope enforcement. Run a representative task through planning, implementation, independent review and verification, ending at the human merge decision. Keep this path usable without Jev.
4. **Make teamwork dependable.** Apply the agreed repair and review limits. Check common failures, interruptions, duplicate delivery, stale approvals and uncertain external actions. Make stopping and resuming observable. Exercise representative Rust work without real wallet keys and report unavailable checks honestly. The owner decides when the agents phase is complete; these issue-level checks do not create an extra phase gate.
5. **Help choose agents and workflows with Jev.** Begin when the owner moves to the Jev phase. Compare useful suggestions with ordinary rules, preserving shared-state question batching. Decide the spending cap before paid runs; the amount is deferred. Measure quality, delay and total cost before claiming an improvement.
6. **Help choose useful extra skills.** Use the real agent skill lists and their permitted access. Preserve required skills and explicit owner requests. Compare the existing selector with a small fit check; add a second call only if evidence supports it.
7. **Consider Jev for permitted recovery choices.** Build on tested recovery procedures. Start with suggestions and obtain owner approval before enabling each new kind of automatic decision. Retain ordinary rules or human decisions when Jev adds no useful benefit.

The issues can overlap where their plans permit it. Add blocking relationships only for real prerequisites. Production wallet work remains later; automatic provider fallback, increased concurrency and broader autonomous authority remain deferred.

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
