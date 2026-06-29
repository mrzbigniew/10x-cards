---
date: 2026-06-29T00:00:00+02:00
researcher: Zbigniew Jędraczka
git_commit: 9c39e352ac829af91a7acb07368187d00efb955c
branch: main
repository: mrzbigniew/10x-cards
topic: "CI/CD Code Review — gap analysis between requirements.md and current implementation"
tags: [research, codebase, github-actions, code-review, ci-cd, composite-action, tool-loop-agent]
status: complete
last_updated: 2026-06-29
last_updated_by: Zbigniew Jędraczka
---

# Research: CI/CD Code Review

**Date**: 2026-06-29T00:00:00+02:00
**Researcher**: Zbigniew Jędraczka
**Git Commit**: 9c39e352ac829af91a7acb07368187d00efb955c
**Branch**: main
**Repository**: mrzbigniew/10x-cards

## Research Question

What is the current state of the `ci-cd-code-review` implementation relative to the
expectations in `requirements.md`? What exists, what is missing, and what are the
architectural connections between the layers?

## Summary

The implementation exists in three layers: a GHA workflow stub (`review.yml`), a composite
action stub (`action.yml`), and a fully-implemented TypeScript AI-review package
(`packages/code-reviewer/`). The TypeScript layer is production-ready. The GHA bridge
between them is not — `reviewer.js` (the compiled entry-point the action invokes) does not
exist, and six additional wiring gaps prevent the workflow from fulfilling any requirement
from `requirements.md`.

No label automation (`ai-cr:passed`/`ai-cr:failed`/`ai-cr:review`) and no PR-comment
posting have been implemented in the workflow layer yet.

---

## Detailed Findings

### Layer 1: GHA Workflow — `.github/workflows/review.yml`

- **Triggers** (lines 3–6): `pull_request` targeting `main` + `workflow_call`. Correct
  branch target (`main`, not `master` as requirements.md says — see Historical Context).
- **Job `review`** (lines 8–19): single job on `ubuntu-latest`.
- **Steps**:
  1. `actions/checkout@v4` — checks out the repo so the local composite action path resolves.
  2. Step `review` (id: `review`): calls `./.github/actions/reviewer` with four inputs:
     - `api_key: ${{ secrets.LLM_PROVIDER_API_KEY }}`
     - `pr-title: ${{ github.event.pull_request.title }}`
     - `pr-body: ${{ github.event.pull_request.body }}`
     - `diff: ${{ steps.diff.outputs.value }}` ← **references a non-existent step**
- **No subsequent steps**: the `verdict` output is never read, no comment posted, no labels applied.

### Layer 2: Composite Action — `.github/actions/reviewer/action.yml`

- **Inputs declared** (lines 11–13): only `api_key`. The three inputs passed by the
  workflow (`pr-title`, `pr-body`, `diff`) are silently dropped — GitHub Actions ignores
  undeclared inputs.
- **Outputs** (lines 17–20): `verdict`, mapped from `steps.reviewer.outputs.verdict`.
- **Single step** (lines 26–31): runs `node ${{ github.action_path }}/reviewer.js` with
  env var `LLM_PROVIDER_API_KEY=${{ inputs.api_key }}`.
- **`reviewer.js` does not exist** — only `action.yml` is in
  `.github/actions/reviewer/`. The step will fail at runtime with a file-not-found error.

### Layer 3: TypeScript Package — `packages/code-reviewer/`

This layer is **complete and approved** (impl-review APPROVED, per archive).

| File                                            | Role                                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| `packages/code-reviewer/src/agent/reviewer.ts`  | `reviewer` ToolLoopAgent; exports `reviewCode(code: string): Promise<Review>`       |
| `packages/code-reviewer/src/schemas/review.ts`  | `ReviewSchema`: `{ summary, issues[{severity, message, line}], score(0–10) }`       |
| `packages/code-reviewer/src/prompts/review.ts`  | `REVIEW_SYSTEM_PROMPT`, `buildReviewPrompt()`                                       |
| `packages/code-reviewer/src/tools/get-lines.ts` | `getLinesTool` — line-citation tool via `experimental_context`                      |
| `packages/code-reviewer/package.json`           | `@10x/code-reviewer`; deps: `ai@^6`, `@openrouter/ai-sdk-provider@^2.9.1`, `zod@^4` |

**Provider**: OpenRouter (`z-ai/glm-5.1i` model). Reads `process.env.OPENROUTER_API_KEY`.
**Important**: the secret in GHA is `LLM_PROVIDER_API_KEY`; the action sets
`LLM_PROVIDER_API_KEY` as env var; but the package reads `OPENROUTER_API_KEY`. These must
be reconciled in `reviewer.js` or in the action env map.

---

## Gap Analysis: Requirements vs. Current Implementation

| Requirement                                   | Status  | Gap                                                         |
| --------------------------------------------- | ------- | ----------------------------------------------------------- |
| GHA workflow triggers on every new PR to main | Partial | Trigger exists; missing `labeled` event for on-demand retry |
| Composite action for review logic             | Partial | `action.yml` exists; `reviewer.js` missing                  |
| Input: PR title                               | Partial | Passed by workflow but not declared in action               |
| Input: PR description                         | Partial | Passed by workflow but not declared in action               |
| Input: git diff                               | Missing | `steps.diff` step not implemented; diff value always empty  |
| 10 review criteria applied                    | Missing | Depends on `reviewer.js` + prompt wiring                    |
| PR comment with summary                       | Missing | No comment-posting step in workflow                         |
| Label `ai-cr:passed` (green)                  | Missing | No label step; label not even created in repo               |
| Label `ai-cr:failed` (red)                    | Missing | No label step; label not even created in repo               |
| On-demand retry via `ai-cr:review` label      | Missing | Trigger type `labeled` not in `review.yml`                  |

---

## Code References

- `.github/workflows/review.yml:3-6` — trigger block (pull_request + workflow_call)
- `.github/workflows/review.yml:13-19` — composite action call with four inputs
- `.github/workflows/review.yml:19` — dangling `steps.diff.outputs.value` reference
- `.github/actions/reviewer/action.yml:11-13` — only `api_key` declared as input
- `.github/actions/reviewer/action.yml:17-20` — `verdict` output definition
- `.github/actions/reviewer/action.yml:26-31` — step invoking missing `reviewer.js`
- `.github/actions/reviewer/action.yml:31` — `LLM_PROVIDER_API_KEY` env var set
- `packages/code-reviewer/src/agent/reviewer.ts` — `reviewCode()` entry point
- `packages/code-reviewer/src/schemas/review.ts` — `ReviewSchema`
- `packages/code-reviewer/package.json` — `@10x/code-reviewer`, OpenRouter dependency

---

## Architecture Insights

**The bridge gap**: The TS package exposes `reviewCode(code: string)`. The GHA action needs
a `reviewer.js` Node.js script that (a) reads inputs from the environment / `GITHUB_OUTPUT`
mechanism, (b) imports or bundles the TS package, (c) calls `reviewCode()` with the diff,
and (d) writes the verdict to `$GITHUB_OUTPUT`.

**Bundling decision required**: GitHub Actions run Node.js scripts directly — they do not
install npm dependencies. `reviewer.js` must either be a pre-bundled single file (e.g.,
built with `esbuild` or `ncc`) or the action must add an `npm ci` step before running the
script. Given the action is composite (not a Docker action), the bundled-file approach is
simpler and faster.

**Label API**: Applying labels requires calling the GitHub REST API (e.g.,
`octokit.issues.addLabels`). The `GITHUB_TOKEN` secret (auto-provided) is sufficient for
label operations on the same repo. The labels `ai-cr:passed`, `ai-cr:failed`, and
`ai-cr:review` must be created in the repo settings before any workflow step can apply them.

**On-demand retry pattern**: To support `ai-cr:review`-triggered reruns, `review.yml`
needs:

```yaml
on:
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened, labeled]
```

Plus a job-level `if:` condition to filter when the labeled event fires — only run the
review when `github.event.label.name == 'ai-cr:review'` (or always, and remove the label
after the run to avoid re-triggering).

**Env var reconciliation**: The cleanest fix is to have `action.yml` set _both_:

```yaml
env:
  LLM_PROVIDER_API_KEY: ${{ inputs.api_key }}
  OPENROUTER_API_KEY: ${{ inputs.api_key }}
```

…until the package is updated to read a provider-agnostic name.

---

## Historical Context (from prior changes)

- **Branch was `master` in requirements.md but repo uses `main`**: Fixed during
  `quality-gates-wiring` (commit `4d1b7a3`). `review.yml` correctly targets `main`.
  The word "master" in `requirements.md` is a copy error — do not change the workflow.
  `context/archive/2026-06-08-quality-gates-wiring/plan.md`

- **GHA was deleted entirely in May 2026**: The deployment slice removed `ci.yml` in favor
  of Cloudflare Workers Builds. It was restored in June 2026 for quality gates. The new
  `review.yml` therefore needs to coexist with `ci.yml` without duplicating jobs.
  `context/archive/2026-05-30-deployment/deploy-plan.md:22-28`

- **`packages/code-reviewer/` was built and reviewed as `tool-loop-agent`**: The TypeScript
  AI engine is the output of that archived change and is production-ready. The June 2026
  impl-review approved it. The current change's job is to wire it into GHA, not rebuild it.
  `context/archive/2026-06-23-tool-loop-agent/change.md`

- **CI quality gates locked as lint → typecheck → test → build**: Any new workflow jobs
  should not duplicate or conflict with this order in `ci.yml`.
  `context/archive/2026-06-08-quality-gates-wiring/research.md:38-65`

---

## Related Research

- `context/archive/2026-06-08-quality-gates-wiring/research.md` — CI infrastructure state
  and gap analysis that preceded the current `ci.yml`
- `context/archive/2026-06-23-tool-loop-agent/reviews/impl-review.md` — approved review
  of the TypeScript code-reviewer package being wired up here

---

## Open Questions

1. **Bundling strategy for `reviewer.js`**: esbuild/ncc single-file bundle committed to
   repo, or `npm ci` step added to the composite action? The trade-off is build-time
   complexity vs. workflow runtime duration.

2. **PR description inclusion**: `requirements.md` marks it with `(?? cost tradeoff)`.
   Should the prompt always include `pr-body`, or gate it behind a size threshold or
   explicit opt-in label?

3. **Score threshold for pass/fail**: `ReviewSchema` includes `score (0–10)`. What numeric
   threshold maps to `ai-cr:passed` vs. `ai-cr:failed`? This is not specified in
   `requirements.md`.

4. **Label creation**: Who creates the three repo labels (`ai-cr:passed`, `ai-cr:failed`,
   `ai-cr:review`) — manual setup step, or a one-time GHA job?

5. **`workflow_call` trigger purpose**: `review.yml` declares `workflow_call` but no other
   workflow calls it. Is this intentional for future use, or accidental scaffolding?
