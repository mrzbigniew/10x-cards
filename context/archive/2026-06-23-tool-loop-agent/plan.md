# Modular ToolLoopAgent Code Reviewer Implementation Plan

## Overview

Convert the monolithic `packages/code-reviewer/src/index.ts` (44 lines doing five jobs at once) into a well-organized, reusable code-review agent built on the ai-sdk `ToolLoopAgent` pattern. Structured-output schemas and prompts move into dedicated modules, a real `get_lines` line-citation tool is added so the agent exercises the tool loop, and the package exports both the configured agent instance and a thin `reviewCode(code)` wrapper so a promptfoo eval can consume it later. The eval environment itself is explicitly out of scope.

## Current State Analysis

`src/index.ts` currently bundles everything into one file:

- OpenRouter provider construction + `model` export (`openrouter("openai/gpt-4o-mini")`) — `src/index.ts:5-9`
- `SYSTEM_PROMPT` constant — `src/index.ts:11-12`
- `ReviewSchema` (Zod) + `Review` type — `src/index.ts:14-26`
- `reviewCode(code)` using `generateText` + `Output.object({ schema })` — `src/index.ts:28-36`
- A **top-level `await generateText(...)` smoke test with `console.log`** that runs on every import — `src/index.ts:38-43`

Key constraints discovered:

- **The on-import smoke test blocks reuse.** Any consumer that imports the module (including promptfoo) triggers a live network call at import time. This must move behind a main-module guard.
- **`node_modules` is not installed** in the package yet — only `package-lock.json` is staged. The implementer must `npm install` in `packages/code-reviewer` before typechecking.
- **No `@/` path alias** in this package's `tsconfig.json` (that alias belongs to the root app). This package uses relative imports; `tsconfig` `include` is `["src"]`, `module`/`moduleResolution` are `ESNext`/`bundler`, `"type": "module"` in package.json.
- **Provider stays OpenRouter.** `@openrouter/ai-sdk-provider` is already a dependency and `OPENROUTER_API_KEY` wiring exists; no provider/dependency churn.

### Key Discoveries:

- **`ToolLoopAgent` API** (verified via ai-sdk.dev docs): constructed with `{ model, instructions, tools, output }`; structured output via `output: Output.object({ schema })`; invoked with `await agent.generate({ prompt })` returning a typed `{ output }`. It is a reusable class instance — the exact reuse surface promptfoo needs.
- **Per-call tool data flows via `experimental_context`** (verified via ai-sdk.dev docs): pass `experimental_context` to `agent.generate({ prompt, experimental_context })` and read it in the tool's `execute(input, { experimental_context })`. This lets a single, module-level `reviewer` agent carry a `get_lines` tool that reads the current code per request — no need to rebuild the agent per call.
- **Skill file conventions** (`references/type-safe-agents.md`): agents live in an `agents/` dir, tools in a `tools/` dir, one definition per file. Adapted here under `src/` (no `lib/`).
- **Lessons that apply** (`context/foundation/lessons.md`): never swallow errors (errors propagate unwrapped — confirmed decision); always write files with LF line endings.

## Desired End State

A `packages/code-reviewer/src/` tree organized as:

```
src/
  schemas/review.ts     # ReviewSchema, Review type
  prompts/review.ts     # REVIEW_SYSTEM_PROMPT (instructions) + buildReviewPrompt(code)
  tools/get-lines.ts    # getLinesTool — line-citation tool reading code from experimental_context
  agent/reviewer.ts     # model, reviewer (ToolLoopAgent), reviewCode(code), re-exported types
  index.ts              # public barrel re-exporting agent module + guarded smoke test
```

Verifiable outcome:

- `import { reviewer, reviewCode, ReviewSchema, type Review } from "@10x/code-reviewer"` (via `src/index.ts`) works **without triggering any network call**.
- `reviewCode(code)` returns a `Review` parsed against `ReviewSchema`, with the agent able to call `get_lines` mid-loop to cite accurate line numbers.
- `npm run dev` still prints a smoke-test result (now guarded so it only runs when the file is the entrypoint).
- `npm run typecheck` (`tsc --noEmit`) passes.

## What We're NOT Doing

- **Not configuring the promptfoo eval environment** — no `promptfooconfig.yaml`, no eval provider adapter, no test cases. We only ensure the export surface is eval-ready.
- **Not switching providers** — staying on OpenRouter; no Vercel AI Gateway migration, no dependency changes beyond installing what's already in `package.json`.
- **Not changing the public input contract** — `reviewCode` still takes a raw `code: string`.
- **Not adding a unit-test harness** — the package currently has no test runner; the verification surface is typecheck + a manual smoke run. Adding a test framework is future work.
- **Not adding more tools** — only the single `get_lines` tool.
- **Not building a full CLI** — the entrypoint stays a guarded smoke test, not an arg-parsing CLI.

## Implementation Approach

Three incremental phases, each independently typecheckable:

1. **Extract pure modules** (schemas, prompts, the `get_lines` tool). `index.ts` is left untouched and keeps compiling, so the repo is green after this phase even though nothing is wired yet.
2. **Build the agent module** that composes those modules into a `ToolLoopAgent`, implements `reviewCode`, and exports the reusable surface. `index.ts` is still untouched (the old code still works) — the new module just adds capability.
3. **Rewire `index.ts`** into a thin public barrel and move the smoke test behind a main-module guard, deleting the now-duplicated monolithic code.

This ordering means the only "destructive" edit (gutting `index.ts`) happens last, after the replacement is in place and typechecking.

## Critical Implementation Details

- **Single agent instance + per-call tool data.** The `reviewer` agent is created once at module load. The `get_lines` tool must NOT close over a fixed code string; it reads the code from `experimental_context` inside its `execute`. `reviewCode` passes `experimental_context: { code }` into `reviewer.generate(...)`. This is what keeps the exported agent both reusable and stateless across calls. Type the context as `{ code: string }` at the read site (the `experimental_context` arg is typed `unknown`).
- **Smoke-test guard.** Use a main-module check so the demo block runs only under `npm run dev`, never on import. With `"type": "module"` + tsx, the standard guard is comparing `import.meta.url` against the invoked entry (e.g. `process.argv[1]`), or `import.meta.main` if available in the runtime. The implementer should pick whichever the installed `tsx`/Node version supports and verify `npm run dev` still prints output while a bare import does not.

## Phase 1: Extract Pure Modules (schemas, prompts, tool)

### Overview

Pull the schema, prompt, and a new line-citation tool out of `index.ts` into focused modules. No wiring yet; `index.ts` is unchanged and still owns the working code. New files compile on their own.

### Changes Required:

#### 1. Review schema module

**File**: `packages/code-reviewer/src/schemas/review.ts`

**Intent**: Become the single home for the structured-output contract so both the agent and future evals import the same schema.

**Contract**: Export `ReviewSchema` (the Zod object currently at `src/index.ts:14-24`: `summary: string`, `issues: array<{ severity: enum["error","warning","info"], message: string, line?: number }>`, `score: number` 0–10) and `export type Review = z.infer<typeof ReviewSchema>`. No behavior change to the schema shape.

#### 2. Prompt module

**File**: `packages/code-reviewer/src/prompts/review.ts`

**Intent**: Separate the agent's system instructions and the per-request prompt assembly from agent wiring, so prompts can be tuned/evaluated independently.

**Contract**: Export `REVIEW_SYSTEM_PROMPT` (the senior-code-reviewer string from `src/index.ts:11-12`, used as the agent's `instructions`) and a pure function `buildReviewPrompt(code: string): string` (returns the `Review this code...` prompt body from `src/index.ts:33`). The system prompt may be lightly expanded to mention the `get_lines` tool is available for citing line numbers.

#### 3. get_lines line-citation tool

**File**: `packages/code-reviewer/src/tools/get-lines.ts`

**Intent**: Give the agent a real, self-contained tool it can call mid-loop to fetch numbered source lines and cite accurate `line` values in issues, exercising the tool loop deterministically (no external services).

**Contract**: Export `getLinesTool` built with `tool({ description, inputSchema, execute })` from `ai`. `inputSchema` is a Zod object with `startLine: number` and `endLine: number` (1-based, inclusive). `execute(input, { experimental_context })` reads `{ code }` from `experimental_context`, splits the code on newlines, and returns the requested range as numbered lines (e.g. an array of `{ line, text }` or a numbered string). Must clamp/validate the range against available lines and handle out-of-range/empty input without throwing for ordinary cases (a missing context `code` is a programming error and may throw). Note: use `inputSchema`, not the deprecated `parameters`.

### Success Criteria:

#### Automated Verification:

- Dependencies installed: `npm install` (in `packages/code-reviewer`) completes
- Type checking passes: `npm run typecheck`
- New files exist: `src/schemas/review.ts`, `src/prompts/review.ts`, `src/tools/get-lines.ts`

#### Manual Verification:

- The three new modules export the documented names and the `get_lines` tool reads code from `experimental_context` (not a closed-over constant)

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: Build the Reviewer Agent Module

### Overview

Compose the extracted modules into a reusable `ToolLoopAgent` and implement the `reviewCode` wrapper. `index.ts` remains untouched this phase (old code still functions), so the repo stays green.

### Changes Required:

#### 1. Reviewer agent module

**File**: `packages/code-reviewer/src/agent/reviewer.ts`

**Intent**: Define the reusable, eval-ready review agent and its convenience wrapper — the heart of the refactor.

**Contract**:

- Construct the OpenRouter `model` here (move `createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })` + `openrouter("openai/gpt-4o-mini")` from `src/index.ts:5-9`) and export it as `model`.
- Export `reviewer = new ToolLoopAgent({ model, instructions: REVIEW_SYSTEM_PROMPT, tools: { get_lines: getLinesTool }, output: Output.object({ schema: ReviewSchema }) })`.
- Export `async function reviewCode(code: string): Promise<Review>` that calls `const { output } = await reviewer.generate({ prompt: buildReviewPrompt(code), experimental_context: { code } })` and returns `output`. **No try/catch** — ai-sdk/tool errors propagate unwrapped (honors the never-swallow lesson).
- Re-export `Review` and `ReviewSchema` for convenience.

Imports use relative paths (no `@/` alias in this package). `Output` and `ToolLoopAgent` come from `ai`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- `src/agent/reviewer.ts` exists and exports `model`, `reviewer`, `reviewCode`, `Review`, `ReviewSchema`

#### Manual Verification:

- `reviewer.generate({ prompt, experimental_context: { code } })` returns a value whose `output` conforms to `ReviewSchema` (verified via a one-off run in Phase 3's smoke test or an ad-hoc script)
- The agent can invoke `get_lines` and populate `issues[].line` with plausible numbers

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 3: Rewire index.ts as Public Barrel + Guarded Smoke Test

### Overview

Replace the monolithic `index.ts` with a thin public barrel that re-exports the agent module, and move the smoke test behind a main-module guard so importing the package is side-effect-free.

### Changes Required:

#### 1. Public barrel + guarded entrypoint

**File**: `packages/code-reviewer/src/index.ts`

**Intent**: Make the package safely importable (for promptfoo and any consumer) while preserving the `npm run dev` sanity check.

**Contract**:

- Remove the old inline provider/schema/prompt/`reviewCode` definitions (now living in their modules) and the unguarded top-level smoke test.
- Re-export the public surface from `./agent/reviewer` (`model`, `reviewer`, `reviewCode`, `Review`, `ReviewSchema`) and optionally the schema/prompt/tool modules.
- Add a smoke-test block guarded by a main-module check (see Critical Implementation Details) that runs the existing `'Say "AI SDK + OpenRouter + Zod ready!"'` demo (or a `reviewCode` demo) and `console.log`s the result **only when `index.ts` is the invoked entrypoint**.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- `npm run dev` runs the guarded smoke test and prints output

#### Manual Verification:

- Importing the package (e.g. `node -e "import('./src/index.ts')"` via tsx, or a scratch importer) does **not** trigger a network call / console output
- `reviewCode("...sample code...")` returns a populated `Review` (summary, issues with severities, score in 0–10)
- No leftover duplicated definitions in `index.ts`

**Implementation Note**: Final phase — confirm the full import-safety + smoke-run behavior manually.

---

## Testing Strategy

### Unit Tests:

- None added this change (package has no test runner). The `get_lines` range logic (clamping, out-of-range, inclusive bounds) is the most test-worthy unit and is a prime candidate when a test harness is introduced later.

### Integration Tests:

- Deferred to the future promptfoo eval (out of scope). The export surface (`reviewer` + `reviewCode`) is the integration seam being prepared.

### Manual Testing Steps:

1. `cd packages/code-reviewer && npm install`
2. `npm run typecheck` — passes.
3. `npm run dev` — prints the smoke-test output (network call fires).
4. From a scratch file, `import { reviewCode } from "./src/index.ts"` and confirm **no** output/network on import alone.
5. Call `reviewCode` with a short snippet containing an obvious issue (e.g. an unused variable) and confirm the returned `Review` has a non-empty `issues` array, valid severities, and a `score` within 0–10; confirm at least one issue carries a `line` (evidence the `get_lines` tool was used).

## Performance Considerations

Negligible. The `get_lines` tool adds potential extra model round-trips (tool-call steps), which increases latency/token use per review versus the old single-shot call — expected and acceptable for a reviewer agent. No loop-bound concerns for the small inputs in scope.

## Migration Notes

The public API is preserved: `model`, `reviewCode`, `ReviewSchema`, `Review` remain importable from the package root, so existing importers keep working. The new addition is the `reviewer` agent instance. The only behavioral change is that the smoke test no longer runs on import — intended.

## References

- AI SDK `ToolLoopAgent` + structured output: https://ai-sdk.dev/docs/agents/building-agents and https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent
- `experimental_context` for tools: https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling
- Skill file conventions: `packages/code-reviewer/.claude/skills/ai-sdk/references/type-safe-agents.md`
- Common API renames (`parameters` → `inputSchema`, `generateObject` → `generateText`+`output`): `packages/code-reviewer/.claude/skills/ai-sdk/references/common-errors.md`
- Original source: `packages/code-reviewer/src/index.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Extract Pure Modules (schemas, prompts, tool)

#### Automated

- [x] 1.1 Dependencies installed: `npm install` completes — 68c50c7
- [x] 1.2 Type checking passes: `npm run typecheck` — 68c50c7
- [x] 1.3 New files exist: `src/schemas/review.ts`, `src/prompts/review.ts`, `src/tools/get-lines.ts` — 68c50c7

#### Manual

- [x] 1.4 Modules export documented names; `get_lines` reads code from `experimental_context` — 68c50c7

### Phase 2: Build the Reviewer Agent Module

#### Automated

- [x] 2.1 Type checking passes: `npm run typecheck` — 29f2715
- [x] 2.2 `src/agent/reviewer.ts` exports `model`, `reviewer`, `reviewCode`, `Review`, `ReviewSchema` — 29f2715

#### Manual

- [x] 2.3 `reviewer.generate(...)` output conforms to `ReviewSchema` — b8a29c9
- [x] 2.4 Agent invokes `get_lines` and populates `issues[].line` — b8a29c9

### Phase 3: Rewire index.ts as Public Barrel + Guarded Smoke Test

#### Automated

- [x] 3.1 Type checking passes: `npm run typecheck` — b8a29c9
- [x] 3.2 `npm run dev` runs the guarded smoke test and prints output — b8a29c9

#### Manual

- [x] 3.3 Importing the package triggers no network call / console output — b8a29c9
- [x] 3.4 `reviewCode(...)` returns a populated `Review` (summary, issues, score 0–10) — b8a29c9
- [x] 3.5 No leftover duplicated definitions in `index.ts` — b8a29c9
