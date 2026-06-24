# Modular ToolLoopAgent Code Reviewer — Plan Brief

> Full plan: `context/changes/tool-loop-agent/plan.md`

## What & Why

Convert the monolithic `packages/code-reviewer/src/index.ts` into a well-organized, modular code-review agent built on the ai-sdk `ToolLoopAgent`. Schemas and prompts move into their own modules, a real `get_lines` tool is added, and the package exports a reusable agent + `reviewCode()` wrapper so promptfoo evals can run against it later.

## Starting Point

Today a single 44-line file bundles the OpenRouter model, system prompt, Zod `ReviewSchema`, the `reviewCode()` function, and a top-level smoke test that fires a live network call on every import — which would break any eval that imports the module.

## Desired End State

A `src/` tree split into `schemas/`, `prompts/`, `tools/`, and `agent/`, with `index.ts` as a thin public barrel. Importing the package is side-effect-free; `reviewCode(code)` returns a schema-validated `Review`; the agent can call `get_lines` mid-loop to cite accurate line numbers; `npm run dev` still prints a smoke result behind a main-module guard.

## Key Decisions Made

| Decision           | Choice                                  | Why (1 sentence)                                                 | Source |
| ------------------ | --------------------------------------- | ---------------------------------------------------------------- | ------ |
| Provider           | Keep OpenRouter                         | Zero dependency/env churn; `.env` already wired                  | Plan   |
| Tools              | Add real `get_lines` line-citation tool | Genuinely exercises the tool loop; deterministic, self-contained | Plan   |
| Export surface     | Agent instance + `reviewCode()` wrapper | promptfoo uses the function; advanced evals use the agent        | Plan   |
| Input contract     | Keep raw `code: string`                 | No API break; simplest test cases                                | Plan   |
| Smoke test         | Guard behind main-module check          | Makes module safely importable while keeping `npm run dev`       | Plan   |
| Error handling     | Propagate unwrapped                     | Honors the never-swallow-errors lesson                           | Plan   |
| Per-call tool data | `experimental_context: { code }`        | Lets one reusable agent carry a stateless per-request tool       | Plan   |

## Scope

**In scope:** modular extraction (schemas/prompts/tool/agent); `ToolLoopAgent` wiring with `Output.object`; `get_lines` tool; exporting `reviewer` + `reviewCode` + types; import-safe entrypoint.

**Out of scope:** promptfoo config/test cases; provider switch; input-contract change; unit-test harness; additional tools; a full CLI.

## Architecture / Approach

`index.ts` (barrel + guarded smoke test) → `agent/reviewer.ts` (model + `ToolLoopAgent` + `reviewCode`) → composes `schemas/review.ts`, `prompts/review.ts`, `tools/get-lines.ts`. A single module-level `reviewer` agent stays reusable; per-request code reaches the `get_lines` tool through `experimental_context` rather than a closure.

## Phases at a Glance

| Phase                   | What it delivers                                                   | Key risk                                                              |
| ----------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| 1. Extract pure modules | `schemas/`, `prompts/`, `tools/get-lines.ts`; `index.ts` untouched | Getting the tool to read context (not a closure) right                |
| 2. Build agent module   | `agent/reviewer.ts` with agent + `reviewCode` + exports            | `ToolLoopAgent`/`Output` wiring correctness                           |
| 3. Rewire index.ts      | Public barrel + main-module-guarded smoke test                     | Picking a guard that works under tsx/Node + deleting old code cleanly |

**Prerequisites:** `npm install` in `packages/code-reviewer` (only `package-lock.json` is staged; `node_modules` absent).
**Estimated effort:** ~1 session across 3 small phases.

## Open Risks & Assumptions

- The main-module-guard idiom depends on the installed `tsx`/Node version (`import.meta.main` vs `import.meta.url`/`process.argv[1]`) — verified during Phase 3.
- No automated test runner exists, so `get_lines` range logic is verified manually until a harness is added later.
- Adding the tool introduces extra model round-trips (more latency/tokens per review) — expected and acceptable.

## Success Criteria (Summary)

- Package imports with no network side effect; `reviewCode(code)` returns a valid `Review` (severities + score 0–10), with line citations from `get_lines`.
- `npm run typecheck` passes and `npm run dev` still prints a smoke result.
- `reviewer` agent + `reviewCode` are exported and ready for a future promptfoo eval.
