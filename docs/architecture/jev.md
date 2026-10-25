# Jev integration reference

This is the repository's local implementation reference for [Jev](https://docs.typesafe.ai/concepts/system-one),
TypeSafe's System One model. It is a concise, repository-specific summary of the
authoritative TypeSafe documentation, not a replacement for that documentation.
When this file conflicts with the upstream reference, the upstream reference
wins and this file must be updated.

**Documentation checked:** 2026-10-25  
**Primary sources:** [TypeSafe documentation index](https://docs.typesafe.ai/llms.txt),
[System One](https://docs.typesafe.ai/concepts/system-one),
[State](https://docs.typesafe.ai/concepts/state),
[How to build with TypeSafe](https://docs.typesafe.ai/concepts/how-to-build-with-system-one),
[System One API](https://docs.typesafe.ai/api/system-one)

## What Jev is

Jev is a System One decision model. It evaluates a `state` and returns typed,
constrained answers to named `questions`. It is not a chat model, code
completion model, or autonomous agent: application code owns control flow,
side effects, retries, thresholds, and escalation.

Jev currently accepts text, JSON objects, and arrays of text as state. Images,
audio, and video are not part of the ordinary text-only path. A Jev response
contains the resolved model name, one answer per question id, and token usage.

## Question primitives

The current TypeSafe documentation defines these primitives:

| Primitive | Use it for | Important answer fields |
|---|---|---|
| `choice` | Select one value from a fixed, closed set | `choice`, `probabilities`, `confidence` |
| `score` | Rate a state against ordered descriptive levels | `score`, `probabilities`, `confidence` |
| `noul` | Evaluate one yes/no proposition | `noul`, a probability from `0` to `1` |

There is **no documented `scope` primitive** in the current TypeSafe
documentation. In this repository, “scope” means the application boundary
around a Jev call: the task's allowed paths, the state fields intentionally
sent to Jev, the question set, and the deterministic code that consumes the
answers. Do not send `type: "scope"` or invent a scope answer field.

### Choice

Use `choice` only when the answer space is a defined set of alternatives.
Each option belongs in `criteria` with a description that distinguishes it
from neighboring options. Include an `other` or `none of the above` option
when the set may be incomplete, or pair the Choice with a Noul that checks
whether any option applies.

`confidence` summarizes how concentrated the returned probability distribution
is. Use the selected `choice` for the label, `probabilities` when code needs
to compare alternatives, and `confidence` when code needs an uncertainty gate.

### Score

Use `score` for an ordered rubric, not for an arbitrary classification. Define
the levels in order and describe what each level means. Preserve the returned
probabilities when downstream code needs to distinguish adjacent uncertainty
from disagreement between distant levels.

### Noul

Use one Noul for one clearly phrased proposition. Its `noul` value is the
probability that the proposition is true; it is not a degree or severity
scale. A value near `0.5` is uncertainty. TypeSafe suggests starting around
`0.7` for yes and `0.3` for no, with the middle range routed to review, but
thresholds must be calibrated against this repository's data and risk.

Nouls do not have a separate `confidence` field. Do not read one from a Noul
answer or treat `noul` as a Score.

## API shape

The HTTP endpoint is:

```text
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer <TYPESAFE_API_KEY>
Content-Type: application/json
```

The request has three required fields:

```json
{
  "model": "jev-latest",
  "state": "content or a structured JSON value",
  "questions": {
    "question_id": {
      "type": "noul",
      "instructions": "One narrow proposition"
    }
  }
}
```

`questions` must contain at least one named question. The answer is returned
under the same id:

```json
{
  "model": "jev-1.13.0",
  "answers": {
    "question_id": {
      "type": "noul",
      "noul": 0.91
    }
  },
  "usage": {
    "input_tokens": 120,
    "output_tokens": 12
  }
}
```

The supplied alias may resolve to a concrete model name. Do not assume the
response model string is identical to the request alias.

## Rules for this control plane

1. Keep deterministic workflow, policy checks, contract validation, side
   effects, and approvals in repository code and human-owned processes.
2. Send Jev only the state needed for the current decision. Prefer named JSON
   fields over an unstructured concatenated prompt.
3. Make questions atomic and explicit. Split compound judgments into multiple
   questions and combine their answers in code.
4. Ask independent questions in one request when they use the same state.
   Jev evaluates them independently; one answer is not hidden context for
   another.
5. Route uncertainty instead of guessing. Low-confidence or middle-threshold
   answers should go to clarification, human review, or a more capable
   reasoning model.
6. Keep question definitions and threshold constants together so reviewers can
   inspect the actual routing policy.
7. Treat Jev output as an input to policy, not as authorization. A model answer
   cannot grant scope expansion, approval, merge authority, credential access,
   or permission to bypass a contract.
8. Never put API keys in source, contracts, logs, or this documentation. Use
   `TYPESAFE_API_KEY` through the approved runtime secret mechanism.
9. Pin or record the resolved model when reproducibility matters; aliases such
   as `jev-latest` can change over time.
10. Test routing thresholds and failure behavior with representative fixtures.
    Do not claim calibration from a handful of examples.

## Mapping Jev to repository routing

Suitable Jev decisions include:

- `choice`: select a named instruction, workflow family, or reviewer route from
  an already-approved set;
- `noul`: detect whether a task requests a sensitive operation, needs
  escalation, or matches a narrowly defined policy condition;
- `score`: rank urgency or review risk only when the rubric and downstream
  actions are explicit.

The returned value must be translated into a normal repository contract or
state transition. A Jev answer must not directly execute a tool, mutate a
remote repository, alter `task.scope`, approve a plan, or skip a reviewer.
Those actions remain governed by the contracts, state machine, approval policy,
and human decision rules in `.github/control-plane/`.

## Common mistakes

- Treating Jev as the LLM that powers an agent rather than as a structured
  decision service.
- Using a Noul to represent severity or degree instead of a yes/no proposition.
- Using a Choice without a complete option set or without distinguishing similar
  options.
- Treating `confidence` as available on Noul answers.
- Allowing model output to become executable instructions or authorization.
- Sending the whole repository, secrets, unrelated issue text, or hidden
  reasoning as state.
- Assuming probabilities are guarantees. They are calibrated decision signals,
  not proof that an individual answer is correct.
- Inventing a `scope` question type. Scope is enforced by this repository's
  contracts and code, not by a Jev primitive.

## Further references

- [Jev with coding agents](https://docs.typesafe.ai/introduction/coding-agents)
- [Quick start](https://docs.typesafe.ai/introduction/quickstart)
- [Choice](https://docs.typesafe.ai/primitives/choice)
- [Score](https://docs.typesafe.ai/primitives/score)
- [Noul](https://docs.typesafe.ai/primitives/noul)
- [Confidence](https://docs.typesafe.ai/confidence)
- [Agent skill](https://docs.typesafe.ai/agent-skill)
- [OpenAPI specification](https://api.typesafe.ai/openapi.json)
