# CI/CD Code Review Implementation Plan

## Overview

Wire the already-built, approved `@10x/code-reviewer` TypeScript package into GitHub
Actions so every pull request to `main` receives an AI code review. The review runs in a
composite action (encapsulating the LLM call), and the workflow stays thin and readable:
extract the PR diff → run the review action → post a summary comment → apply a pass/fail
label. The verdict is `score >= 7 → ai-cr:passed`, else `ai-cr:failed`. An `ai-cr:review`
label triggers an on-demand re-run.

This change does **not** rebuild the AI engine — `packages/code-reviewer/` is production-ready
(approved in the archived `tool-loop-agent` change). The work is the GHA bridge plus the
PR-side effects (comment, labels, retry).

## Current State Analysis

Three layers exist; only the engine is complete:

- **Engine (done)** — `packages/code-reviewer/` exposes `reviewCode(code): Promise<Review>`,
  where `Review = { summary: string, issues: { severity: "error"|"warning"|"info",
message: string, line: number | null }[], score: number(0–10) }`
  (`src/schemas/review.ts:3-16`). Provider is OpenRouter (`z-ai/glm-5.1i`), reading
  `process.env.OPENROUTER_API_KEY` (`src/agent/reviewer.ts:8-12`). The package is **not** a
  root workspace member (no `workspaces` in root `package.json`) and has its own deps
  (`ai@^6`, `@openrouter/ai-sdk-provider@^2.9.1`, `zod@^4`) plus `tsx` as a devDependency.
- **Composite action (stub)** — `.github/actions/reviewer/action.yml` declares only
  `api_key`, outputs `verdict`, and runs `node ${{ github.action_path }}/reviewer.js` with
  env `LLM_PROVIDER_API_KEY`. **`reviewer.js` does not exist**; the three workflow inputs
  (`pr-title`, `pr-body`, `diff`) are undeclared and silently dropped; the env var name
  (`LLM_PROVIDER_API_KEY`) does not match what the package reads (`OPENROUTER_API_KEY`).
- **Workflow (stub)** — `.github/workflows/review.yml` triggers on `pull_request` to `main`
  plus an unused `workflow_call`. It checks out, calls the action, and passes
  `diff: ${{ steps.diff.outputs.value }}` — a reference to a **non-existent step**. No
  comment, no labels, no retry trigger.

`ci.yml` (lint→typecheck→test→build) is a separate workflow and must not be duplicated. The
three labels `ai-cr:passed`, `ai-cr:failed`, `ai-cr:review` do not yet exist in the repo.

### Key Discoveries:

- `reviewCode` takes only a code string; PR title/body are not threaded through
  (`src/agent/reviewer.ts:37-43`). The 10 review criteria from requirements are **not** in
  the prompt — `REVIEW_SYSTEM_PROMPT` is a single generic sentence (`src/prompts/review.ts:1-2`).
- Env mismatch must be reconciled: action sets `LLM_PROVIDER_API_KEY`, package reads
  `OPENROUTER_API_KEY` (`research.md:81-84`).
- Package is standalone — `npm ci` must run inside `packages/code-reviewer/`, not at root.
- `tsx` is already a devDependency, so the action can run TypeScript directly without a
  separate compile/bundle step (`packages/code-reviewer/package.json:16`).
- Step outputs are fragile for large/multiline payloads (diff, markdown summary) — pass via
  files on disk instead.

## Desired End State

Opening or updating a PR against `main` runs the AI review automatically. Within the run a
single summary comment appears on the PR and exactly one of `ai-cr:passed` / `ai-cr:failed`
is applied (the opposite removed). Adding the `ai-cr:review` label re-runs the review, then
that label is removed so it can be re-applied to trigger again. Verify by opening a test PR
and observing the comment + label, then re-adding `ai-cr:review` and observing a fresh run.

## What We're NOT Doing

- Not rebuilding or re-reviewing the `@10x/code-reviewer` engine (agent, tools, schema).
- Not adding business-alignment or architectural-fit criteria (parked in requirements.md).
- Not pre-bundling with esbuild/ncc — the action installs deps with `npm ci` and runs `tsx`.
- Not implementing a sticky/upsert comment — a fresh comment is posted each run (per decision).
- Not keeping `workflow_call` — it has no caller and is removed.
- Not gating or truncating `pr-body` — it is always included in the prompt.
- Not changing `ci.yml` or the locked lint→typecheck→test→build order.

## Implementation Approach

Split responsibility cleanly: the **composite action owns "the review itself"** (deps + LLM
call + verdict computation + rendering the comment body), exposing simple outputs; the
**workflow owns orchestration and GitHub side-effects** (diff extraction, comment, labels,
retry), so it reads top-to-bottom as checkout → diff → review → comment → labels.

Data that is large or multiline (the diff, the rendered markdown comment) is passed through
**files on disk** (`$RUNNER_TEMP`), never through step outputs — only scalar outputs
(`verdict`, `score`, `comment_path`) cross the action boundary.

The diff is extracted in the workflow with `gh pr diff` (uses the auto-provided
`GITHUB_TOKEN`), avoiding merge-base arithmetic.

## Critical Implementation Details

- **Diff and comment payloads go through files, not step outputs.** GitHub step outputs have
  size/escaping limits that break on real diffs and multiline markdown. The workflow writes
  the diff to `$RUNNER_TEMP/pr.diff`; the CI script writes the comment body to
  `$RUNNER_TEMP/review.md` and emits only its path. Only `verdict`/`score`/`comment_path`
  are step outputs.
- **`npm ci` runs inside `packages/code-reviewer/`**, with `working-directory` set on the
  action steps — the package is standalone, not a root workspace member, so a root install
  does not pull its deps.
- **Env reconciliation:** the action must export `OPENROUTER_API_KEY` (what the package
  reads) from `api_key`; it may also keep `LLM_PROVIDER_API_KEY` for forward-compat, but
  `OPENROUTER_API_KEY` is the load-bearing one.
- **Retry-label ordering:** when the run is triggered by the `ai-cr:review` label, remove
  that label _after_ applying the verdict, so re-adding it reliably re-fires the workflow.
  The job-level `if` must allow non-`labeled` events unconditionally and `labeled` events
  only when `github.event.label.name == 'ai-cr:review'`.

## Phase 1: CI bridge in the package

### Overview

Add a typed entry point that takes PR context, produces a verdict and a rendered markdown
comment, and is runnable by the action via `tsx`. Encode the 10 review criteria in the
prompt. Unit-test the pure logic (verdict, rendering) without a live model call.

### Changes Required:

#### 1. Review prompt — encode the 10 criteria and thread PR context

**File**: `packages/code-reviewer/src/prompts/review.ts`

**Intent**: Make the system prompt actually express the requirements' 10 criteria (logic
over syntax, security-first, match style, explain "why", performance, actionable fixes, test
coverage, over-engineering, praise, state assumptions). Extend prompt building to incorporate
PR title and body so the model has author intent.

**Contract**: `REVIEW_SYSTEM_PROMPT` enumerates the 10 criteria and keeps the `get_lines`
tool guidance. Add `buildPullRequestPrompt({ title, body, diff }: { title: string; body: string; diff: string }): string` alongside the existing `buildReviewPrompt(code)` (which stays for evals). The PR prompt embeds title + body + diff.

#### 2. Pull-request review entry — thread context to the agent

**File**: `packages/code-reviewer/src/agent/reviewer.ts`

**Intent**: Add a `reviewPullRequest` function that reviews a PR (title/body/diff) and
returns the existing `Review`. Reuse the existing agent instance; the diff is the "code"
passed to `experimental_context` so `get_lines` still works.

**Contract**: `export async function reviewPullRequest(input: { title: string; body: string; diff: string }): Promise<Review>` — builds the prompt via `buildPullRequestPrompt`, calls `reviewer.generate` with `options: { code: input.diff }`. `reviewCode` is unchanged. Re-export from `src/index.ts`.

#### 3. Verdict + comment rendering — pure helpers

**File**: `packages/code-reviewer/src/ci/render.ts` (new)

**Intent**: Centralize the two pure decisions the CI needs: map a `Review` to a verdict
given a threshold, and render the PR comment markdown. Keeping these pure makes them
unit-testable without the model.

**Contract**:

- `verdictFor(review: Review, threshold: number): "passed" | "failed"` — `review.score >= threshold ? "passed" : "failed"`.
- `renderComment(review: Review, verdict: "passed" | "failed"): string` — markdown with a header (verdict + score), the `summary`, and an issues list grouped/labelled by `severity` with line citations (`line` may be null). User-facing comment text is in English (this is a developer CI artifact, not product UI — the Polish-UI lesson does not apply to PR-bot output).

#### 4. CI runner script — the action's entry point

**File**: `packages/code-reviewer/src/ci/review-pr.ts` (new)

**Intent**: The script the composite action runs via `tsx`. Reads PR title/body and diff
(from a file path) and the score threshold from the environment, runs `reviewPullRequest`,
computes the verdict, writes the rendered comment to a file, and emits `verdict`, `score`,
and `comment_path` to `$GITHUB_OUTPUT`. Never swallows errors — a failed review fails the
step (non-zero exit) rather than silently passing.

**Contract**: Reads env `PR_TITLE`, `PR_BODY`, `DIFF_PATH`, `SCORE_THRESHOLD` (default 7),
`GITHUB_OUTPUT`, `RUNNER_TEMP`. Reads the diff file at `DIFF_PATH`. Writes comment markdown
to `${RUNNER_TEMP}/review.md`. Appends `verdict=…`, `score=…`, `comment_path=…` to
`$GITHUB_OUTPUT`. Exits non-zero on any failure (no try/catch that swallows). Run via
`npx tsx src/ci/review-pr.ts` from the package directory.

#### 5. Unit tests for the pure logic

**File**: `packages/code-reviewer/src/ci/render.test.ts` (new)

**Intent**: Lock the verdict boundary and comment rendering so threshold/format regressions
are caught without a live model.

**Contract**: Cover `verdictFor` at the boundary (score 7 → passed, 6.9 → failed, 0/10
extremes) and `renderComment` (includes verdict, score, summary; renders an issue with a
line and one with `line: null`; handles an empty issues array).

### Success Criteria:

#### Automated Verification:

- Package typechecks: `npm run typecheck` (in `packages/code-reviewer/`)
- Unit tests pass: `npx vitest run` for `src/ci/render.test.ts`
- Root lint passes: `npm run lint`

#### Manual Verification:

- Running `DIFF_PATH=… PR_TITLE=… PR_BODY=… npx tsx src/ci/review-pr.ts` against a sample
  diff (with a real `OPENROUTER_API_KEY`) prints a sane verdict and writes `review.md`.
- The rendered comment reads clearly and cites line numbers where the model provided them.

**Implementation Note**: After this phase and all automated verification passes, pause for
manual confirmation before proceeding.

---

## Phase 2: Composite action contract

### Overview

Make the action self-contained: declare every input the workflow passes, install the
package's deps, run the CI script with the correct env, and expose the scalar outputs the
workflow needs.

### Changes Required:

#### 1. Declare inputs and outputs

**File**: `.github/actions/reviewer/action.yml`

**Intent**: Stop silently dropping inputs and expose what the workflow needs for side-effects.

**Contract**: Inputs: `api_key` (required), `pr-title`, `pr-body`, `diff-path` (path to the
diff file), `threshold` (default `"7"`). Outputs: `verdict`, `score`, `comment_path`, each
mapped from the runner step's outputs.

#### 2. Install deps and run the CI script

**File**: `.github/actions/reviewer/action.yml`

**Intent**: Replace the missing-`reviewer.js` step with a real install-and-run sequence,
reconciling the env var the package reads. Delete the stale `node …/reviewer.js` step.

**Contract**: Steps (all with `working-directory: packages/code-reviewer`):
`actions/setup-node@v4` (node 22, `cache: npm`, `cache-dependency-path: packages/code-reviewer/package-lock.json`) → `npm ci` → run `npx tsx src/ci/review-pr.ts` (id `reviewer`) with env `OPENROUTER_API_KEY: ${{ inputs.api_key }}`, `PR_TITLE`, `PR_BODY`, `DIFF_PATH: ${{ inputs.diff-path }}`, `SCORE_THRESHOLD: ${{ inputs.threshold }}`. The script writes `verdict`/`score`/`comment_path` to `$GITHUB_OUTPUT`, which the action outputs surface. (Requires a committed `packages/code-reviewer/package-lock.json` for `npm ci` + cache; generate it if absent.)

### Success Criteria:

#### Automated Verification:

- `action.yml` is valid YAML and parses: `actionlint` (or `npx @action-validator/cli`) reports no errors.
- `packages/code-reviewer/package-lock.json` exists (required by `npm ci`).

#### Manual Verification:

- In a scratch PR, the `review` step completes: deps install, `tsx` runs, and the step
  exposes non-empty `verdict`/`score`/`comment_path` outputs.

**Implementation Note**: Pause for manual confirmation after automated checks pass.

---

## Phase 3: Workflow orchestration

### Overview

Make `review.yml` read top-to-bottom and produce the required side-effects: extract the diff,
call the action, post a comment, ensure + apply labels, and support `ai-cr:review` retry.

### Changes Required:

#### 1. Triggers, permissions, and retry gate

**File**: `.github/workflows/review.yml`

**Intent**: Add the `labeled` event for on-demand retry, grant the token write access for
comments/labels, gate the job so label events only run for `ai-cr:review`, and drop the
unused `workflow_call`.

**Contract**: `on.pull_request.types: [opened, synchronize, reopened, labeled]`, branches
`[main]`; remove `workflow_call`. Add `permissions: { contents: read, pull-requests: write, issues: write }`. Job-level `if: github.event_name != 'pull_request' || github.event.action != 'labeled' || github.event.label.name == 'ai-cr:review'`.

#### 2. Diff extraction step

**File**: `.github/workflows/review.yml`

**Intent**: Produce the diff file the action consumes, replacing the dangling
`steps.diff.outputs.value`.

**Contract**: After `actions/checkout@v4`, a step runs `gh pr diff ${{ github.event.pull_request.number }} --patch > "$RUNNER_TEMP/pr.diff"` with env `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`, and exposes the path (e.g. step output `path=$RUNNER_TEMP/pr.diff`). Pass it to the action as `diff-path`.

#### 3. Call the review action

**File**: `.github/workflows/review.yml`

**Intent**: Invoke the composite action with the corrected inputs.

**Contract**: `uses: ./.github/actions/reviewer` with `api_key: ${{ secrets.LLM_PROVIDER_API_KEY }}`, `pr-title: ${{ github.event.pull_request.title }}`, `pr-body: ${{ github.event.pull_request.body }}`, `diff-path: <step output from #2>`. Capture `verdict`/`score`/`comment_path` from the action's outputs.

#### 4. Post the summary comment

**File**: `.github/workflows/review.yml`

**Intent**: Post a fresh comment each run from the rendered markdown file.

**Contract**: `actions/github-script@v7` reads the file at the action's `comment_path` with
`fs` and calls `github.rest.issues.createComment({ ...context.repo, issue_number, body })`.

#### 5. Ensure and apply verdict labels

**File**: `.github/workflows/review.yml`

**Intent**: Idempotently guarantee the three labels exist, then apply the verdict label and
remove the opposite one.

**Contract**: `actions/github-script@v7` step that, for each of `ai-cr:passed` (green),
`ai-cr:failed` (red), `ai-cr:review`, calls `createLabel` and ignores "already_exists"
errors; then `addLabels` for the verdict label and `removeLabel` for the opposite verdict
label (ignoring 404). Label color/description defined inline.

#### 6. Remove the retry label after a retry run

**File**: `.github/workflows/review.yml`

**Intent**: After an `ai-cr:review`-triggered run, remove that label so re-adding it
re-fires the workflow.

**Contract**: `actions/github-script@v7` step with `if: github.event.action == 'labeled' && github.event.label.name == 'ai-cr:review'` that calls `removeLabel` for `ai-cr:review` (ignoring 404).

### Success Criteria:

#### Automated Verification:

- `review.yml` parses with no errors: `actionlint`.
- No dangling step references remain (grep for `steps.diff.outputs.value` returns nothing).

#### Manual Verification:

- Opening a test PR to `main` triggers the workflow; a summary comment appears and exactly
  one of `ai-cr:passed`/`ai-cr:failed` is applied.
- Re-pushing to the PR posts a new comment and updates the label.
- Adding `ai-cr:review` re-runs the review; the label is removed afterward and can be
  re-added to trigger again.
- The three labels exist in the repo after the first run (created idempotently).

**Implementation Note**: Pause for manual confirmation; the label/comment behavior can only
be fully verified on a live PR.

---

## Testing Strategy

### Unit Tests:

- `verdictFor` threshold boundary (7→passed, 6.9→failed, 0/10 extremes).
- `renderComment` output (verdict header, score, summary, issue with line, issue with
  `line: null`, empty issues).

### Integration Tests:

- End-to-end on a scratch PR: diff extraction → action run → comment + label. (Manual; GHA
  side-effects are not unit-testable.)

### Manual Testing Steps:

1. Open a PR to `main` with a small code change; confirm a comment + one verdict label.
2. Push another commit; confirm a new comment and the label reflects the latest verdict.
3. Add `ai-cr:review`; confirm a fresh run, then the label is auto-removed.
4. Inspect repo labels — all three exist with the expected colors.

## Performance Considerations

`npm ci` inside the action adds ~20–40s per run; acceptable for PR-cadence reviews. The diff
and comment go through files, so payload size is not bounded by step-output limits.

## Migration Notes

The labels are created idempotently on first run — no manual setup. `workflow_call` is
removed; confirm no other workflow references `review.yml` before deleting (research Q5
confirmed there is no caller).

## References

- Research: `context/changes/ci-cd-code-review/research.md`
- Requirements: `context/changes/ci-cd-code-review/requirements.md`
- Engine entry: `packages/code-reviewer/src/agent/reviewer.ts:37-43`
- Review schema: `packages/code-reviewer/src/schemas/review.ts:3-16`
- Action stub: `.github/actions/reviewer/action.yml`
- Workflow stub: `.github/workflows/review.yml`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: CI bridge in the package

#### Automated

- [x] 1.1 Package typechecks: `npm run typecheck` — 5dc182f
- [x] 1.2 Unit tests pass: `npx vitest run src/ci/render.test.ts` — 5dc182f
- [x] 1.3 Root lint passes: `npm run lint` — 5dc182f

#### Manual

- [x] 1.4 `tsx src/ci/review-pr.ts` against a sample diff prints a sane verdict and writes review.md — 5dc182f
- [x] 1.5 Rendered comment reads clearly and cites line numbers — 5dc182f

### Phase 2: Composite action contract

#### Automated

- [x] 2.1 `action.yml` passes `actionlint` — 1ccf680
- [x] 2.2 `packages/code-reviewer/package-lock.json` exists — 1ccf680

#### Manual

- [ ] 2.3 Scratch-PR review step installs deps, runs tsx, exposes non-empty outputs

### Phase 3: Workflow orchestration

#### Automated

- [x] 3.1 `review.yml` passes `actionlint`
- [x] 3.2 No dangling `steps.diff.outputs.value` reference remains

#### Manual

- [ ] 3.3 Test PR triggers workflow; comment + one verdict label appear
- [ ] 3.4 Re-push posts new comment and updates label
- [ ] 3.5 `ai-cr:review` re-runs review and is auto-removed afterward
- [ ] 3.6 All three labels exist in the repo with expected colors
