# Test Plan Refresh 2026-06-08 — Plan Brief

> Full plan: `context/changes/test-plan-refresh-2026-06-08/plan.md`
> Research: `context/changes/test-plan-refresh-2026-06-08/research.md`

## What & Why

Three risks surfaced from slices S-07 (modal generation) and S-08 (modal review) plus a
high-churn hook: a generating-phase dismiss guard gap in `GenerationModal` that silently
discards pasted text; a real bug in `resetDeckProgress` that leaves the deck list stale after
a successful reset; and missing test depth for the Again-requeue chain in `useReviewSession`.
This change fixes the first two and fills all three test gaps.

## Starting Point

`GenerationModal.tsx:28-35` guards dismiss only when `phase === "reviewing"`; the generating
phase is unguarded. `useDeckList.ts:71-77` follows the correct pessimistic pattern for
`createDeck` and `deleteDeck` (both call `refresh()`) but `resetDeckProgress` never does.
`useReviewSession.test.ts` has four cases but none assert `finished === true` or an Again→Again
chain deeper than one step.

## Desired End State

Dismissing the generation modal while AI is in flight shows the same confirmation dialog as
dismissing with proposals on screen. Resetting deck progress immediately refreshes the deck list.
All three `useDeckList` mutations have error + success path coverage. `useReviewSession.test.ts`
has a three-scenario table proving the Again→Again chain, multi-card session end, and the
`remaining` invariant. The lessons.md portal lesson names the correct library. `test-plan.md` is
current with two new phases, updated stack notes, and freshness metadata.

## Key Decisions Made

| Decision              | Choice                            | Why (1 sentence)                                                                           | Source   |
| --------------------- | --------------------------------- | ------------------------------------------------------------------------------------------ | -------- |
| Guard scope for R-A   | `generating` phase only           | Covers the exact user risk (in-flight text); `input` and `saving` are low-stakes           | Research |
| Guard dialog message  | Same "Zamknąć?" dialog            | Zero additional UI; message is accurate for both guarded phases                            | Plan     |
| R-B fix placement     | Inline in Phase 1 alongside tests | Test and fix ship together; fix without test would arrive unguarded                        | Plan     |
| lessons.md fix timing | Phase 1 (earliest)                | Lessons are re-read at start of every implement/plan run                                   | Plan     |
| R-C scenario depth    | 3-scenario table                  | Covers chain, multi-card end condition, and `remaining` invariant; each asserts `finished` | Plan     |
| test-plan.md sections | §2 + §3 + §4 + §6.5 + §8          | §4 "no infra" text is misleading; §6.5 was placeholder; §8 needs F-02 watch item           | Plan     |

## Scope

**In scope:**

- Generating-phase guard extension in `GenerationModal.tsx`
- `resetDeckProgress` `refresh()` bug fix in `useDeckList.ts`
- New `src/test/GenerationModal.test.tsx` (3 cases)
- New `src/test/useDeckList.test.ts` (6 cases — error + success × 3 mutations)
- Extended `src/test/useReviewSession.test.ts` (3 new scenario-table cases)
- `context/foundation/lessons.md` correction (react-doom → react-dom)
- `context/foundation/test-plan.md` updates (§2, §3, §4, §6.5, §8)

**Out of scope:**

- Guarding `"input"` and `"saving"` phases
- Distinct generating-phase dialog message
- New API routes, schema changes, or service-layer code
- Mutation testing for this change

## Architecture / Approach

All changes are UI-layer and test-layer. Phase 1 pairs each fix with its regression guard:
the `GenerationModal` component test mocks `useGeneration` to control `phase` and asserts
guard/no-guard behavior; the `useDeckList` hook test uses fetch spy call count to detect whether
`refresh()` was triggered. Phase 2 extends an existing hook test file and updates two foundation
docs — no code changes.

## Phases at a Glance

| Phase                   | What it delivers                                                           | Key risk                                                      |
| ----------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1. modal-and-hook-gaps  | Guard fix + bug fix + GenerationModal test + useDeckList test + lessons.md | `vi.mock` isolation for modal component test                  |
| 2. review-requeue-depth | 3 new useReviewSession scenarios + test-plan.md refresh                    | Fetch mock count must match Again→Again→non-Again chain depth |

**Prerequisites:** Phase 1 complete and all 1.x automated gates passing before Phase 2 starts.
**Estimated effort:** ~2 sessions across 2 phases.

## Open Risks & Assumptions

- `@testing-library/react` must be installed (check `package.json`); it was introduced in Phase 1
  of the original rollout — verify before writing `GenerationModal.test.tsx`.
- `GenerationFlow` child component must be mockable without import-cycle issues; if not, switch to
  a shallow render approach or move the test to a pure guard-logic unit test on `handleCloseRequest`.

## Success Criteria (Summary)

- Dismissing the generation modal during active AI generation shows a confirmation dialog
- Resetting deck progress immediately updates the displayed deck list
- `npm run test` passes with all new cases green, including `finished === true` assertions in the Again-requeue suite
