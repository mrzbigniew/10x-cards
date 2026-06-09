<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: data-testid Coverage for Playwright Tests

- **Plan**: context/changes/tests-data-testid/plan.md
- **Scope**: All Phases (1-2 of 2)
- **Date**: 2026-06-10
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Automated Checks

| Check                 | Result                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| `npm run typecheck`   | PASS — 0 errors, 0 warnings (95 files)                                                                 |
| `npm run lint`        | PASS — 0 errors (1 pre-existing warning in sr.ts, unrelated)                                           |
| `npm test`            | PASS — 93 passed, 15 files                                                                             |
| `npx playwright test` | ENV ISSUE — auth setup fails; E2E user not seeded in local dev DB; pre-existing, no auth files touched |

## Findings

### F1 — 4 of 6 modals render inline, not via createPortal

- **Severity**: 💬 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: src/components/AddCardModal.tsx, src/components/decks/CreateDeckModal.tsx, src/components/decks/DeleteDeckModal.tsx, src/components/decks/ResetProgressModal.tsx
- **Detail**: The plan stated "All 6 modals use createPortal (per lessons.md rule)" but only GenerationModal and ReviewModal actually do. The other 4 render their modal divs inline in the component tree. lessons.md rule: "All modals must be rendered using createPortal from react-dom." This is a pre-existing codebase issue — this change did not introduce it — but the plan's inaccurate discovery means it was not caught here. The data-testid placement is still functionally correct (outermost div of each modal component).
- **Fix**: Migrate the 4 inline modals to createPortal in a follow-up change to comply with the lessons.md rule.
  - Strength: Aligns with the established lessons.md rule and prevents z-index / stacking-context bugs from parent containers. The two portal-correct modals (Generation, Review) serve as reference implementations.
  - Tradeoff: Separate change needed; slightly more wrapper code per modal. Low risk since the four modals are self-contained and no tests depend on their DOM position.
  - Confidence: HIGH — clear reference implementations exist.
  - Blind spot: Whether any parent containers currently clip these modals in practice (may already be a latent visual bug).
- **Decision**: PENDING
