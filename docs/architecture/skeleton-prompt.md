# Original skeleton prompt

This is a historical archive of the prompt used to establish the empty
layout. Its skeleton-only instructions were superseded by later user
requests to build the control-plane foundations. Do not treat commands or
restrictions below as current instructions; follow the current task and
[AGENTS.md](../../AGENTS.md). Start with [CONTRIBUTING.md](../../CONTRIBUTING.md)
to see how the implemented pieces connect.

The original text is preserved verbatim below.

---

Create and push a new GitHub repository containing ONLY the skeleton for a hybrid GitHub control plane. Use git and gh. Keep the control plane in .github/ and reserve adapters for execution through different agent CLIs, local runners, and GitHub runners.

Defaults: repository name github-control-plane, current authenticated GitHub user as owner, PRIVATE visibility, and main as the default branch. Use any explicit overrides I provide. Check gh authentication and work in a new dedicated directory. If the target directory or repository already exists, report the collision instead of overwriting it.

SCOPE — SKELETON ONLY

Create directories and completely empty, zero-byte placeholder files. Do not write agent descriptions, instructions, prompts, YAML/JSON bodies, frontmatter, schemas, scripts, application code, tests, TODO comments, or documentation content. Do not install dependencies or use a project generator.

The ONLY nonempty repository file allowed is .gitignore, containing the minimal ignore rules described below. Commands used to create and inspect the skeleton are allowed; do not commit a scaffolding or validation script.

Keep every .disabled suffix. This is our placeholder naming convention, not a GitHub feature. In particular, create NO active .yml or .yaml files in .github/workflows/. Keep reusable workflow placeholders directly in that directory.

Do not enable workflows or configure remote rulesets, required checks, secrets, variables, environments, runners, webhooks, or deployments. Reserve their locations only. Do not start implementing the skeleton after creating it.

LAYOUT

Expand braces into separate paths; never create literal brace filenames. A trailing slash denotes a directory: preserve otherwise empty directories with a zero-byte .gitkeep.

```text
README.md
AGENTS.md
.gitignore
.env.example
.vars.example

.github/AGENTS.md
.github/copilot-instructions.md
.github/CODEOWNERS
.github/SECURITY.md
.github/PULL_REQUEST_TEMPLATE.md
.github/ISSUE_TEMPLATE/{task,plan,bug,escalation}.yml.disabled
.github/dependabot.yml.disabled

.github/workflows/{intake,plan-review,implement,verify,merge-gate}.yml.disabled
.github/workflows/{agent-evals,recovery,maintenance,release}.yml.disabled
.github/workflows/{reusable-agent,reusable-checks}.yml.disabled
.github/actions/{setup-runtime,run-agent,validate-contract,collect-evidence}/action.yml.disabled

.github/agents/{coordinator,planner,implementer,reviewer,security-auditor,verifier}.agent.md.disabled
.github/instructions/{planning,implementation,review,security,testing}.instructions.md.disabled
.github/prompts/{plan,implement,review,recover}.prompt.md.disabled
.github/skills/{planning,implementation,review,verification}/SKILL.md.disabled
.github/hooks/{tool-policy,session-audit}.json.disabled

.github/control-plane/adapters/{generic-cli,local-runner,github-runner}/
.github/control-plane/contracts/{task,plan,review,handoff,result,evidence,escalation}.schema.json.disabled
.github/control-plane/orchestration/{routing,state-machine}.yaml.disabled
.github/control-plane/policies/{permissions,tool-access,network-access,approvals}.yaml.disabled
.github/control-plane/policies/{concurrency,retries,budgets,retention}.yaml.disabled
.github/control-plane/settings/{repository,rulesets,environments,labels}.json.disabled
.github/control-plane/settings/{runners,oidc,variables,secrets}.json.disabled
.github/control-plane/context/{project-state,memory,retrieval}/
.github/control-plane/evals/{datasets,graders,fixtures}/
.github/control-plane/observability/{audit,metrics,traces}/

.devcontainer/{devcontainer.json,Dockerfile}.disabled
scripts/{bootstrap,adapters,gates,hooks,recovery}/
docs/{architecture,decisions,plans,threat-models,runbooks,evidence}/
src/
tests/{unit,integration,security}/
```

ARCHITECTURAL BOUNDARIES

Reserve this structure for issue intake, plan-first review, independent reviewers, fan-out/fan-in orchestration, isolated implementation, deterministic verification, merge gating, bounded recovery, evaluations, and evidence collection. These capabilities are represented by names and locations ONLY.

.github/control-plane/ is a custom organizational directory; GitHub does not automatically apply its contents. Likewise, .github/agents/, instructions, prompts, skills, and hooks have tool-specific support. Do not assume every CLI reads them or create provider-specific implementations. Keep the skeleton independent of application language, hardware, and model provider.

ENVIRONMENT AND LOCAL STATE

Create empty .env and .vars files locally, plus .runtime/{worktrees,state,logs,artifacts}/. These are local-only and must be ignored. Track the empty .env.example and .vars.example instead.

Make .gitignore ignore .env, .env.*, .vars, and .vars.* at any depth, with explicit exceptions for .env.example and .vars.example; also ignore the root .runtime/ directory. Do not add variable names, values, credentials, or tokens. These files do not automatically populate GitHub Actions secrets or its vars context.

FINISH AND STOP

1. Verify that all expanded paths exist and every created file except .gitignore is zero bytes.
2. Verify that placeholder suffixes are intact, directory placeholders will be tracked, local environment/runtime files are ignored, and example files are trackable. Use inspection commands only; do not build, run agents, or execute workflows.
3. Initialize git on main, stage only the scaffold, inspect the staged files, and create one initial commit using the existing git identity.
4. Use gh repo create with the chosen name, --private, --source=., --remote=origin, and --push. Verify the remote URL, private visibility, main default branch, and pushed commit.
5. Return the repository URL, the resulting file tree, and a short verification summary. Report any blocker accurately. State that all operational behavior remains unimplemented.

Your task ends with the verified skeleton. Do not populate or activate any placeholder.

