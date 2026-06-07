# Phase 1 Critical-Path Coverage — Plan Brief

> Full plan: `context/changes/testing-critical-path-coverage/plan.md`
> Research: `context/changes/testing-critical-path-coverage/research.md`

## What & Why

Bootstrap the project's first test infrastructure and use it to protect the three critical-path risks from the test plan: AI generation output validity (#1), save-to-deck atomicity (#2), and generation error recovery (#5). Tests assert the *contract* — what the code should do per PRD/domain — not snapshots of current output.

## Starting Point

Zero test infrastructure exists (no Vitest, no MSW, no test files, no `test` script). The three targets are well-seamed: `generateProposals` is a single async function with one error type; `createDeckWithCards` is dependency-injected (easy to stub); `useGeneration.generate()` already preserves text on error.

## Desired End State

`npm run test` runs green with three risk suites plus a smoke test, `npm run lint`/`astro check` stay clean, `createDeckWithCards` no longer leaves an orphan deck on partial failure, Stryker confirms the Risk #1 tests kill mutants, and the test-plan cookbook + rollout status reflect what shipped.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Risk #2 oracle | Fix the bug + assert clean contract | Add best-effort compensating delete so the test proves no orphan deck, not documents one | Plan |
| Integration scope | Hermetic-only now; integration deferred ad-hoc | No local Supabase assumed; CLAUDE.md ad-hoc-gate doctrine | Plan |
| Hook DOM env | `@testing-library/react` + jsdom (`renderHook`) | Standard, well-documented React-hook testing path | Plan |
| Whitespace-only card | **In scope (rev. 2026-06-07)** | Change `ProposalSchema` to `.trim().min(1)` + test so `" "` is rejected | Decision |
| Risk #1 mock seam | `vi.mock` the OpenAI SDK | Deterministic, drives every parse/validate/empty branch without network | Plan |
| Compensating-delete failure | Best-effort: log + throw original error | User sees one coherent error; cleanup failure never masks the real one | Plan |
| Deck-save test breadth | Both `createDeckWithCards` and `appendCardsToDeck` | Both are part of the save-to-deck risk surface | Plan |
| CI wiring | Scripts only, no CI changes | CI wiring is test-plan §3 Phase 4 | Plan |
| Cookbook §6 | Update 6.1/6.2/6.3 in this change | Test plan ties those slots to Phase 1 shipping | Plan |
| Mutation testing | Include a Stryker pass on `generation.ts` | Verify the Risk #1 tests actually kill mutants | Plan |

## Scope

**In scope:** complete the Vitest 4 + MSW + Testing Library + jsdom bootstrap (partially done); non-watch scripts; unit tests for Risks #1/#2/#5; orphan-deck fix; `ProposalSchema` `.trim().min(1)` whitespace fix + test; Stryker pass scoped to `generation.ts`; cookbook + status sync.

**Out of scope:** CI changes; real-Supabase integration test; e2e/a11y/visual; Risks #3/#4/#6; transaction/RPC rewrite of the save path.

## Architecture / Approach

Build the runner first, then cover each risk at the cheapest layer with real signal: `vi.mock` the OpenAI SDK (Risk #1), a hermetic typed stub Supabase client (Risk #2), `renderHook` + mocked `fetch` (Risk #5). Risk #2's test asserts the desired clean contract, so it ships paired with the orphan-deck fix. The Vitest config uses Astro's `getViteConfig` (rev. 2026-06-07), which is expected to resolve the `astro:env/server` virtual module; secret values are toggled per test with `vi.mock("astro:env/server", ...)`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Infra bootstrap | Green Vitest harness, alias + env-stub wiring, scripts | `astro:env/server` resolution; Vite-7 compat |
| 2. Risk #1 tests | Generation failure matrix + happy-path contract | Mirror-test anti-pattern (assert oracle, not snapshot) |
| 3. Risk #2 fix + tests | Orphan-deck fix + hermetic save tests | Stub lying about DB constraints; cleanup-failure path |
| 4. Risk #5 test | Hook error-recovery pinned | Testing only happy path |
| 5. Hardening & handoff | Stryker pass, cookbook, status sync | Chasing 100% mutation score |

**Prerequisites:** npm install access; no external services needed (all hermetic).
**Estimated effort:** ~2–3 sessions across 5 phases.

## Open Risks & Assumptions

- Vitest **4.x** (`^4.1.8`, already installed) is in use with the pinned Vite `^7.3.2` — verify `@vitest/coverage-v8` 4.x and the `getViteConfig` env resolution during Phase 1.
- ESLint `strictTypeChecked` covers test files; tests must import Vitest globals explicitly and type stubs carefully to stay lint-clean.
- Deferred integration assertion (row counts + trigger) is captured as a skipped placeholder, not lost.

## Success Criteria (Summary)

- A malformed/empty LLM response yields a structured Polish error, never a crash; valid input yields a well-formed `{front, back}[]`.
- A failed card insert leaves no deck behind and surfaces one coherent error.
- After a generation API error, pasted text and a retry option remain.
