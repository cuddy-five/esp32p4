# Adopting the template

The generic baseline supplies intake forms, a PR reading guide, owner
routing, security reporting guidance, dependency proposals, contracts, and
CI. Use [CONTRIBUTING.md](../../CONTRIBUTING.md) to follow a change through
those files. The choices below belong to the owner of each repository.

Copy the [project brief](../templates/project-brief.md) to root `PROJECT.md`
and record the product, constraints, owner choices and real checks. Use the
[manual team runbook](agent-team.md) to assign distinct roles and bind proof
to the integrated revision. Keep unknowns explicit; the repository name does
not determine an application or hardware platform.

## Check the destination layout

This template owns root `package.json`, `src/` and `tests/`. Overlaying it
onto an existing application can replace package metadata or mix control-plane
code and tests with application files. Inventory collisions before copying.
For an existing project, choose an adoption and distribution design in a
separate scoped task: whether to vendor the runtime, use a remote action,
or build a consumer adapter remains an owner decision. The current template
does not supply a general consumer layout or workspace-selection option.

## Set the owner and real protections

Replace `@cuddy-five` in [CODEOWNERS](../../.github/CODEOWNERS) with an
eligible user or team that has write access. GitHub uses that file to request
review on eligible PRs. It does not make approval mandatory by itself; see
[GitHub's code-owner rules](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners).

Review [desired rulesets](../../.github/control-plane/settings/rulesets.json)
against the live repository settings. The current declaration sets required
approvals to `0` and `require_code_owner_review` to `false`. Owner review is
our working agreement, not an enforced code-owner approval gate. Decide and
configure the protection you need explicitly. A sole owner cannot approve
their own PR; requiring that approval needs another eligible reviewer.

[settings-sync.yml](../../.github/workflows/settings-sync.yml) can apply
reviewed settings through manual dispatch. Before using it, configure the
`settings-admin` environment and any available required-reviewer protection,
and supply the administration secret for ruleset writes as described in the
[settings runbook](settings-sync.md). An environment name alone does not
provide an approval gate. GitHub feature availability depends on the
repository's visibility and plan; confirm it in the destination settings.

## Choose the declaration source and settings destination

<!-- Follow the source and target separately before any settings apply. -->
The CLI reads desired files from `.github/control-plane/settings/` belonging
to the control-plane installation being executed. `--repo owner/name`
changes the GitHub API destination only. It does not load desired files from
that destination or the current working directory, and there is no CLI
override for the desired-settings directory. Review or edit the source
declarations before pointing the CLI at another repository.

Policy commands likewise load orchestration and approval declarations from
the executed installation's `.github/control-plane/`. Changing the working
directory does not select another repository's policy or settings.

The [validate-contract action](../../.github/actions/validate-contract/action.yml)
uses the installation's schemas to validate caller-provided documents. Its
file inputs resolve in the caller's workspace; this does not select consumer
policy or settings declarations. The action neither applies settings nor
checks consumer policy. Contract validation alone does not enforce role
separation or authenticate human approval; follow the [manual team
runbook](agent-team.md).

Check references to `main` when choosing a different default branch,
especially [ci.yml](../../.github/workflows/ci.yml). Desired rulesets use
`~DEFAULT_BRANCH` for the default branch. External action references also
need the actual owner, repository, and an existing trusted revision;
README placeholders and example tags are not a published release promise.

## Finish the repository choices

- **Reporting:** set an available private contact in
  [SECURITY.md](../../.github/SECURITY.md). GitHub's optional private
  vulnerability reporting applies to public repositories; this private
  repository needs an arranged private contact. Until one exists, ask for
  a contact without including vulnerability details.
- **Updates:** [Dependabot](../../.github/dependabot.yml) proposes weekly
  GitHub Actions and root npm updates once on the default branch. Each has
  a limit of three open version-update PRs. Security-update PRs use separate
  limits and settings. Proposals still need checks and owner review; this
  file does not enable auto-merge. Adjust ecosystems when the copied
  repository changes. See the [supported options](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference).
- **License:** `package.json` currently says `MIT`, but there is no
  `LICENSE` file. The owner must choose the intended license and make the
  file and metadata agree before distributing a copy. This guide does not
  supply a license grant.

## Stop the template here

Remaining `.disabled` files are deliberate placeholders. Agent charters,
automated routing, evidence collection, merge gates, recovery, consumer
adapters, and bootstrap need their own tasks. Application build, release,
and deployment choices belong to the repository built on this foundation.
Do not enable placeholders just to make every file nonempty.

Prove the manual process next with one small documentation change:

1. Ask an agent to draft a docs-only task issue; you may write it yourself.
2. Have the coordinator prepare the task contract and a planner prepare the
   plan, then obtain an independent plan review. Read the proposed change
   and make the owner decision to proceed.
3. Have an implementer prepare the change and PR within that scope; retain
   your chosen commit step.
4. Inspect CI, independent review, and verification evidence through the
   [PR template](../../.github/PULL_REQUEST_TEMPLATE.md).
5. Decide whether to merge yourself, then read the recorded result.

Issue creation and comments do not dispatch this exercise automatically.
