# Build the wallet in small, checked steps

Use this guide for wallet tasks. The control plane helps agents find the right
facts, limit each change, and obtain independent checks. It does not turn a
model's answer or a passing build into proof that a wallet is safe.

## Start here

1. Read [PROJECT.md](../../PROJECT.md) for owner choices and current scope.
2. Read the actual files and current branch before planning. `PROJECT.md` has
   the one dated snapshot of what is merged and what is still in a pull
   request. Code on a branch or in an open pull request is not merged
   functionality; check its state before depending on it.
3. Choose one row in the task table below and read only its relevant sources.
4. State one outcome, allowed paths, checks, unresolved decisions, and the next
   responsible role. Use the [wallet task worksheet](../templates/wallet-task.md)
   in the issue or conversation; a separate document is optional.
5. Follow [the team runbook](agent-team.md) for review and handoff. Check
   `.review-domains.json` on the PR's base branch: when `firmware.task_required`
   is true, as it is for this repository, firmware PRs need the existing
   validated task records. This guide does not waive that gate or require
   extra forms for ordinary manual work.

Get a bounded source and check list from the repository root:

```fish
node scripts/wallet-context.js signing
```

`node` runs the script at its first positional path; `signing` selects the
task topic. No flags are used. Choose `hardware` for board work or `interface`
for transport and display work; `secrets` and `integration` cover the other
rows below. The helper lists fixed source paths and checks. It does not read
arbitrary files, run those checks, start an agent or grant approval.

## Keep facts and choices separate

The selected board is **Waveshare ESP32-P4-WIFI6-Touch-LCD-3.5**. The intended
chip revision is **v3.2**; the owner's physical unit and PCB revision have not
been identified. Check them before applying a schematic or chip erratum. The
owner states the unit carries the 5 MP OV5647 camera; whether a `no_std` stack
can drive it, and several production interface choices, remain unresolved.

Use [device-references](../../.github/skills/device-references/SKILL.md) as the
source index. It distinguishes checked source facts, inference, and unknowns.
Its dates and pins are the scope of its claims; a new release needs a new check.
The historical specification under `docs/plans/` is research input, not an
implementation specification. Do not copy its assumptions into a task.

- **Fork signing:** the owner requires unified sighash only. BLAKE2b is the
  fork's block proof-of-work hash; the unified signature hash uses tagged
  SHA-256. Do not replace transaction or address hashes with BLAKE2b.
- **Stateless operation:** do not persist seeds, private keys or signing history.
  Secret handling needs a reviewed lifetime and memory-placement design.
- **Radio isolation:** firmware must not depend on the onboard ESP32-C6. The
  owner selected physical removal of the chip or its antenna feed; the latter
  leaves the chip running. Neither software omission nor the current records
  proves that the physical unit is isolated.
- **Hardware limits:** a `no_std` cross-build is not a linked boot image, a
  peripheral test, a secret-placement check, or a radio-isolation measurement.

## Give each task the evidence it needs

Links below point into the shared source index; read the pinned primary source
when making a new implementation claim. The check column describes acceptance
to turn into runnable tests for that task, not results already achieved.

| Task | Read first | Acceptance to make concrete |
| --- | --- | --- |
| Transaction or PSBT parsing | [Bitcoin standards](../../.github/skills/device-references/references/bitcoin-standards.md), actual parser API | Valid independent fixtures; truncation, length/count overflow, duplicate or conflicting fields, resource limits and unsupported forms produce explicit errors without panic. Specify byte and collection bounds. |
| Signing policy and unified digest | [Fork rules](../../.github/skills/device-references/references/fork-rules.md), pinned Knots specification and vectors | Each supported script and hash mode has an independent expected result. Reject missing or inconsistent spent-output data, forbidden modes and invalid `SINGLE` output indices. Review annex/code-separator cases when in scope. |
| Seed, key derivation and signatures | [Bitcoin standards](../../.github/skills/device-references/references/bitcoin-standards.md), [chip entropy and memory facts](../../.github/skills/device-references/references/chip-esp32-p4.md) | Pinned vectors; documented entropy-source enablement; bounded secret lifetime; cancellation/error cleanup; no secret output or storage. A source capability flag does not prove entropy quality or linked memory placement. |
| Board bring-up and drivers | [Board facts and schematic](../../.github/skills/device-references/references/board-waveshare-esp32-p4-wifi6-touch-lcd-3.5.md), [chip revision and errata](../../.github/skills/device-references/references/chip-esp32-p4.md) | Exact board/chip identity, reviewed pins and power sequence, selected HAL version, linked image and observed device behavior. Start with public test data and one peripheral. |
| QR transport and transaction display | Selected transport specification, [Bitcoin standards](../../.github/skills/device-references/references/bitcoin-standards.md), board sources | Select protocol and limits before coding. Test incomplete, repeated, reordered and oversized frames; show destination, amount, fee and change without ambiguity; cancel/timeout cannot authorize signing. |
| End-to-end signing and release | Accepted decisions and all relevant rows above | Bind what the user approves to the exact transaction signed; independently verify the result; reject unsupported transactions. Record device, firmware revision, reproducible build inputs and remaining physical checks. |

For signing policy, parsing success means only that data was decoded. The
transaction reader in `wallet-core` accepts transactions with no outputs and
does not enforce monetary bounds. Its digest function accepts more unified hash
bytes for non-taproot inputs than a wallet should necessarily offer. A later signing-policy task must choose
and test the permitted modes, amounts, fees, scripts and networks. Do not weaken
the low-level reference behavior or invent those choices to make tests pass.
RDTS handling also remains an owner decision recorded in issue #21.

## Suggested sequence

This is a dependency order, not approval to implement every stage:

1. Start from the transaction reader and unified digest in `wallet-core`.
   Build on them; do not write a second parser or digest.
2. Specify a narrow signing policy and its rejection table. Resolve policy
   choices before implementing the signing boundary.
3. Build bounded parsing and policy checks in the hardware-independent core;
   add reviewed key derivation and signing using public test vectors.
4. Establish the exact board, camera, chip revision, HAL support and isolation
   evidence. Bring up display, touch and camera in separate tasks with no secrets.
5. Connect bounded transport, transaction display, explicit user approval and
   signing. Test cancellation and failure paths before release work.
6. Verify the complete device and release process separately. Host tests alone
   cannot finish this stage. Irreversible provisioning requires the owner's
   specific procedure and authorization.

Keep a task small enough that its sources, acceptance table and code diff fit
in one review. A smaller model should receive the exact API, relevant source
sections, allowed files, representative fixtures and expected error behavior.
Assign one implementation task at a time; independent reviews may run together.
Do not ask an implementer to choose a protocol, design the entire wallet and
write drivers in the same task.

## Run the existing checks

From the repository root, run the firmware gate. It is the same script CI's
`firmware` job runs:

```fish
bash scripts/gates/firmware-check.sh
```

On the owner's workstation the Rust linker lives in the `devbox` container, so
run it there: `distrobox enter devbox -- bash scripts/gates/firmware-check.sh`.
`distrobox enter` runs a command in that container and `--` ends its options;
`bash` executes the script named by its positional path. The script runs formatting, Clippy, host tests and a release cross-build using
`firmware/rust-toolchain.toml`. It may build dependencies and write build output.
Check that the pinned compiler, components and target are already installed;
Rustup can install missing items automatically. Installation needs its own
reviewed plan. Do not install on the immutable host to repair a missing tool.

During a focused iteration, run
`cargo test --manifest-path firmware/Cargo.toml -p wallet-core --locked` there.
`cargo test` builds and runs tests; `--manifest-path` selects the workspace
manifest, `-p` selects `wallet-core`, and `--locked` prevents lockfile changes.
The focused form does not replace the complete gate.

When `firmware/wallet-core/tests/data/unified_sighash.json` is present, also
compare it with the independent checker:

```fish
python3 .github/skills/device-references/scripts/unified_sighash_check.py firmware/wallet-core/tests/data/unified_sighash.json
```

`python3` runs the first positional script; the second positional path is the
vector file. No flags are used. First verify the fixture's source revision and
hash against its provenance note. This checker covers the pinned vector set,
not every wallet policy, annex or script-execution case. New expected digests
must come from an independently checked source or derivation, never solely
from the implementation being tested.

For control-plane changes run `npm test`, `npm run validate:examples`,
`node src/cli.js policy check` and `git diff --check`. `npm test` runs the
repository test script; `npm run` selects the named example-validation script.
`node` runs the CLI with the `policy check` subcommands. `git diff --check`
checks tracked uncommitted changes for whitespace errors; it does not inspect
untracked files or prove behavior. These checks do not replace the Rust gate.

## Review, stop and hand off

- The implementer supplies the exact commit, or a digest of the uncommitted
  snapshot, plus actual check results and source pins. Separate code review,
  security audit and verification examine that same work.
- Signing and key-handling work require review from another model family under
  [ADR 0003](../decisions/0003-agent-operating-limits.md). Record the actual
  model and family, not just the provider or configured profile. Follow the
  [model launch guidance](agent-tools.md#models); a profile pin alone has not
  prevented fallback. Paid evaluation requires applicable owner authorization.
- Stop the dependent work when a source conflicts, a policy choice is missing,
  a vector disagrees, the target is unverified, or a required review is absent.
  Continue unrelated authorized work; report the blocker and its owner.
- After two repair rounds, report unresolved failures to the owner. Do not
  broaden scope, suppress lints, weaken checks or dismiss a security finding
  to obtain a pass.
- Report what changed, what passed, what was not run, remaining decisions and
  the next role. A successful check grants no commit, merge, hardware rework,
  flash, fuse-programming or release authority. Never use real wallet secrets
  in agent tools or evidence.
