# SR Integration Correctness — Plan Brief

> Full plan: `context/changes/testing-sr-integration-correctness/plan.md`

## What & Why

Write unit tests proving that the spaced-repetition integration boundary works correctly:
due-date filtering, rating persistence, and Again-requeue logic. This is test-plan §3
Phase 2, addressing risk #3 — "SR scheduling error — due cards not shown or shown when
not due." The anti-pattern to avoid is testing ts-fsrs's own algorithm; the goal is to
prove the custom integration layer (mapper, service, queue hook) behaves correctly.

## Starting Point

`sr.ts` and `useReviewSession.ts` are fully implemented and in production. No tests exist
for either. Vitest, the fluent-builder stub pattern, and the hook test pattern are all
established from Phase 1 (`testing-critical-path-coverage`) — this phase reuses them
directly.

## Desired End State

Two new test files — `src/test/sr.test.ts` (7 cases) and
`src/test/useReviewSession.test.ts` (3 cases) — cover all three risk behaviors. The
Stryker mutation run on `sr.ts` is complete with every survived mutant reviewed and
documented. `test-plan.md §3 Phase 2` is marked `done`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| FSRS in tests | Real ts-fsrs with controlled inputs | Tests the row→Card mapper; mocking the scheduler would miss mapping bugs in `rowToFsrsCard` |
| `loadDueCards` assertions | Filter application + result mapping | Both the `.lte()` filter and the DueCard shape are part of the integration contract |
| Non-fatal log path | Explicitly tested | The non-fatal design is a load-bearing decision that must survive future refactors |
| Hook test scope | Again-requeue + Good removal + error path | Scoped to risk #3 behaviors; full lifecycle coverage is out of scope |
| Mutation testing | Yes, scoped to sr.ts | sr.ts contains the mapping and persistence logic Stryker is best at catching |
| Test file layout | Two files (sr.test.ts + useReviewSession.test.ts) | Mirrors generation.test.ts / useGeneration.test.ts separation; keeps mock strategies isolated |
| Supabase stub | Fluent-builder from decks.test.ts, adapted | Consistent with established codebase convention; typed to catch shape mismatches |

## Scope

**In scope:**
- `loadDueCards` — filter application + result mapping + DB error
- `applyRating` — happy path (real FSRS oracle) + load/update errors + non-fatal log
- `useReviewSession.rate()` — Again-requeue, non-Again dequeue, fetch error
- Mutation triage on sr.ts + test-plan status update

**Out of scope:**
- ts-fsrs algorithm correctness (that's ts-fsrs's own tests)
- Specific FSRS output values as business assertions
- Full `useReviewSession` lifecycle (loading state, `finished`, `totalInitial`)
- Integration tests against a real DB (Phase 3)

## Architecture / Approach

Service tests use a typed fluent-builder stub (`makeSrSupabase()`) that routes
`from(table)` to table-specific chain builders. Because `applyRating` calls
`from("card_sr_state")` twice (select then update), each `from()` call creates a fresh
chain instance that detects operation type by which method is called first (`.select()` →
select mode; `.update()` → update mode) — the same operation-type-aware pattern as
`makeDecksChain()` in `decks.test.ts`. The update chain terminates with a Promise from
the second `.eq()` rather than `.single()`. Hook tests spy on `globalThis.fetch` and queue
two `mockResolvedValueOnce` calls per test (load + rate POST). The FSRS oracle is derived
in test setup by constructing a `Card` from the fixture row and calling real ts-fsrs —
this tests the mapper without asserting algorithm outputs.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Service Layer Tests | 7 test cases in sr.test.ts | Update chain stub complexity (no `.single()`) |
| 2. Hook Tests | 3 test cases in useReviewSession.test.ts | Correct fetch mock sequencing (load + rate) |
| 3. Mutation Triage | Survived mutants reviewed + test-plan updated | Stryker finds a gap that needs a new assertion |

**Prerequisites:** Phase 1 (`testing-critical-path-coverage`) complete — Vitest installed,
`src/test/` directory exists, `vitest.config.ts` configured.
**Estimated effort:** ~1 session across 3 phases.

## Open Risks & Assumptions

- `rowToFsrsCard` is not exported — the test must manually replicate its field mapping
  to build the oracle. If the mapping in sr.ts changes, the oracle construction in the
  test must be updated in sync.
- The update chain's terminal behavior (no `.single()`) requires careful stub design;
  if the stub returns `chain` instead of a Promise, `await` will silently resolve with
  the chain object and `error` will be `undefined` — making the update-error test pass
  vacuously.

## Success Criteria (Summary)

- `npm test` passes with 10 new test cases across 2 files.
- `applyRating` non-fatal log test explicitly confirms the function resolves when
  `review_logs` insert fails.
- Every survived mutant in `sr.ts` has a documented decision in `sr.test.ts`.
