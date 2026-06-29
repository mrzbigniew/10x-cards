# CI/CD Code Review — Plan Brief

> Full plan: `context/changes/ci-cd-code-review/plan.md`
> Research: `context/changes/ci-cd-code-review/research.md`

## What & Why

Every pull request to `main` should get an automatic AI code review. The review engine
(`@10x/code-reviewer`) is already built and approved; what's missing is the GitHub Actions
bridge that runs it on a PR and turns its output into a visible comment and a pass/fail
label. This change wires that bridge.

## Starting Point

Three layers exist but only the engine works. `packages/code-reviewer/` exposes
`reviewCode(code)` returning `{ summary, issues[], score(0–10) }`. The composite action
(`.github/actions/reviewer/action.yml`) is a stub that runs a non-existent `reviewer.js`,
drops three of its inputs, and sets the wrong env-var name. The workflow
(`.github/workflows/review.yml`) references a diff step that doesn't exist and posts no
comment or label. The `ai-cr:*` labels don't exist in the repo yet.

## Desired End State

Opening or updating a PR to `main` runs the review, posts a summary comment, and applies
exactly one of `ai-cr:passed` / `ai-cr:failed`. Adding the `ai-cr:review` label re-runs the
review on demand, then removes itself so it can trigger again.

## Key Decisions Made

| Decision                   | Choice                                    | Why (1 sentence)                                                         | Source   |
| -------------------------- | ----------------------------------------- | ------------------------------------------------------------------------ | -------- |
| Bridge dependency strategy | `npm ci` + `tsx` inside the action        | No committed build artifact to keep in sync; always uses current source. | Plan     |
| Pass/fail rule             | `score >= 7` → passed                     | Single tunable knob, simple to reason about (threshold input).           | Plan     |
| Comment behavior           | Fresh comment each run                    | Simplest — one create call, no find-existing logic.                      | Plan     |
| PR body in prompt          | Always include                            | Carries author intent; bodies are small vs the diff.                     | Plan     |
| Label creation             | Idempotent ensure-in-workflow             | Self-contained and reproducible — no manual setup, no drift.             | Plan     |
| Retry + `workflow_call`    | Add `labeled` retry; drop `workflow_call` | Implements the requirement exactly, removes dead scaffolding.            | Plan     |
| Diff / comment transport   | Files on disk, not step outputs           | Step outputs break on large/multiline payloads.                          | Research |
| Env reconciliation         | Action exports `OPENROUTER_API_KEY`       | That's the var the package actually reads.                               | Research |

## Scope

**In scope:**

- A typed CI entry (`reviewPullRequest`, verdict + comment rendering) in the package
- The 10 review criteria encoded in the prompt; PR title/body threaded in
- Composite action: declared inputs/outputs, `npm ci` + `tsx`, env reconciliation
- Workflow: diff extraction, comment, idempotent labels, `ai-cr:review` retry

**Out of scope:**

- Rebuilding the AI engine (agent/tools/schema) — already approved
- esbuild/ncc bundling; sticky/upsert comments; pr-body gating/truncation
- Business-alignment / architectural-fit criteria (parked); changes to `ci.yml`

## Architecture / Approach

The **composite action owns the review** (install deps → run the LLM call → compute verdict →
render the comment markdown) and exposes scalar outputs (`verdict`, `score`, `comment_path`).
The **workflow owns orchestration and side-effects** — checkout → `gh pr diff` to a file →
run the action → post comment → ensure+apply labels → remove retry label — so it reads
top-to-bottom. Large/multiline data (diff, comment body) flows through `$RUNNER_TEMP` files;
only scalars cross the action boundary.

## Phases at a Glance

| Phase                        | What it delivers                                                                        | Key risk                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1. CI bridge in package      | `reviewPullRequest`, verdict/render helpers, runner script, prompt criteria, unit tests | Prompt changes to an approved package; keep `reviewCode` intact |
| 2. Composite action contract | Declared inputs/outputs, `npm ci` + `tsx`, env fix                                      | Needs committed `package-lock.json`; standalone package install |
| 3. Workflow orchestration    | Triggers, diff step, comment, idempotent labels, retry                                  | Side-effects only verifiable on a live PR; token permissions    |

**Prerequisites:** `LLM_PROVIDER_API_KEY` secret set in the repo; ability to open a test PR.
**Estimated effort:** ~2–3 sessions across the 3 phases.

## Open Risks & Assumptions

- `gh pr diff` covers the PR diff adequately; very large diffs may need size handling (not yet bounded).
- Modifying the approved package's prompt is in scope here because the 10 criteria were never wired in.
- Model `score` is somewhat subjective; the `>=7` threshold is exposed as an input for later tuning.

## Success Criteria (Summary)

- A PR to `main` gets one summary comment and exactly one verdict label automatically.
- `ai-cr:review` re-runs the review and clears itself for re-triggering.
- The three `ai-cr:*` labels exist in the repo after the first run, created idempotently.
