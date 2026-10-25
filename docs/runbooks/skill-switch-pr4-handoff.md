# Skill-switch isolated agent profiles: handoff

This note records the prior work on the separate `skill-switch` repository so
the next agent can resume without repeating the investigation. The work is
tracked in draft [PR #4](https://github.com/cuddy-five/skill-switch/pull/4),
linked to [issue #3](https://github.com/cuddy-five/skill-switch/issues/3).

## Repository state at handoff

- Repository: `/var/home/cb/src/skill-switch`
- Branch: `feat/isolated-agent-profiles`
- Commit: `a2678cdf49012188897bd0d9b2f6a7bb45774912`
- The branch was pushed and the working tree was clean at delivery.
- PR #4 remains a draft. No merge was performed.
- This information comes from the preceding agent's handoff summary. The
  current session confirmed that the separate checkout is on the expected
  branch, but did not recheck its commit, tests, or PR state.

## Problem and implementation

Cursor can discover skills in Codex or shared skill directories. Physically
moving a skill therefore cannot keep each agent's enabled set independent.
The implementation adds named per-agent profiles and launches selected CLIs
inside private Bubblewrap filesystem views.

- `skill_profiles.py` owns the skill catalog, snapshots, profile persistence,
  and saved launch commands.
- `launch_view.py` owns agent adapters, discovery roots, launch validation,
  filesystem mounts, and process execution.
- `profile_ui.py` provides the profile CLI and searchable curses interface:
  agent tabs, selection matrix, saved/draft state, preview, and launch.
- `verify_native_profiles.py` provides a reproducible offline native proof.
- `README.md`, `CONTEXT.md`, `GLOSSARY.md`, and
  `docs/adr/0001-isolated-agent-profiles.md` document behavior and decisions.
- The adapter table supports Codex CLI and Cursor CLI. Existing physical
  management remains the default when no profile subcommand is used.

The launch view masks existing skill discovery roots at resolved real paths,
including symlinked shared roots. It leaves each agent's built-in skills
available and hides existing plugin directories as a whole. New sessions
launched through profile mode receive read-only snapshots of selected custom
skills.

Final review fixed two launch-boundary escapes: relative inherited
`CODEX_HOME` now fails before launch, and prompt text after `--` cannot remove
the enforced `--no-daemon` argument.

An earlier parent-overlay design was rejected because it interfered with
normal file creation or risked losing new files. Broad mountpoint preparation
was also abandoned. Do not restore either design without new evidence.

## Verification recorded by the prior agent

- 67 tests passed on Fedora with Python 3.15.0rc2 and Bubblewrap 0.12.0.
- GitHub Actions passed on Python 3.10, 3.13, and 3.14 for both push and PR.
- An independent reviewer checked the two final launch-boundary fixes.
- With synthetic home contents and networking disabled, Codex 0.163.0
  returned exactly the selected custom marker from `skills/list`; system
  built-ins remained available. Cursor 2026.10.01-e373342 reached its login
  screen.
- Authenticated Cursor skill usage was not tested.
- No production profile or shared `.agents` directory was created.
- Temporary logs were `/tmp/skill-switch-host-final.log` and
  `/tmp/skill-switch-host-native.log`; they may no longer exist.

## Limits and next steps

This is a verified Codex/Cursor CLI slice, not universal agent isolation.
Direct launches bypass profiles. Other CLIs and IDE adapters remain
unverified. Discovery roots created after launch, including roots created by
trusted wrappers such as Caveman, fall outside the masked view. Hiding whole
plugin directories also makes plugin tools unavailable in the isolated view.

Next, choose one concrete follow-up: review and merge PR #4, run authenticated
Cursor acceptance, or add another adapter with a native isolation proof. Do
not claim support for agents or launch paths that have not been tested.

The separate `skill-switch` checkout contains the code and full diff. This
handoff note is a summary; it does not replace reviewing PR #4.
