# data-testid Coverage for Playwright Tests — Plan Brief

> Full plan: `context/changes/tests-data-testid/plan.md`
> Research: `context/changes/tests-data-testid/research.md`

## What & Why

Add `data-testid` attributes to interactive elements across 10 component files so Playwright tests can target them without ambiguity. Currently only 1 of 95 interactive elements has a testid (`btn-generate`). Repeating-row components (DeckRow, ProposalRow, CardRow) make `getByRole` unusable for per-row targeting; modals lack stable identity for open/closed assertions.

## Starting Point

One `data-testid` exists today (`btn-generate` in `TextInputForm.tsx`), used by 2 Playwright tests. All other interactive elements must be targeted via text/role selectors, which become ambiguous as soon as the same element repeats across N list rows. No new tests are written in this change — only the DOM anchors are added.

## Desired End State

Every Playwright test can target a row-level action button with `listitem.filter({ hasText: rowName }).getByTestId(...)`, assert a modal's open/closed state via `getByTestId('modal-*')`, click the flip card via `getByTestId('review-card-flipper')`, and assert which generation phase is active via `getByTestId('generation-phase-*')`. Existing tests still pass; `btn-generate` is unchanged.

## Key Decisions Made

| Decision                      | Choice                                       | Why (1 sentence)                                                                       | Source   |
| ----------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------- | -------- |
| Rename `btn-generate`         | Leave as-is                                  | Renaming would break 2 existing Playwright tests for no functional gain                | Plan     |
| RatingButtons testids         | Add all 4                                    | Buttons are unique today but copy changes would silently break tests                   | Plan     |
| DeckDetailHeader rename input | Add `deck-header-input-name`                 | Stable anchor future-proofs rename-flow E2E tests against layout additions             | Plan     |
| GenerationFlow phases         | Add 3 phase wrappers                         | Testid is the right semantic signal for "which view is active" vs. fragile text checks | Plan     |
| Naming convention             | `[context]-[type]-[action]` / `modal-[name]` | Scoped names prevent collision and match the pattern research established              | Research |
| Modal testid placement        | Outermost `<div>` inside `createPortal`      | That is the element Playwright's DOM snapshot sees (per lessons.md portal rule)        | Research |

## Scope

**In scope:**

- DeckRow: 4 icon-only action buttons
- ProposalRow: 6 action buttons (normal + edit mode)
- CardRow: 6 action buttons (normal + edit mode + delete confirm)
- 6 modal root containers
- ReviewSession flip-card div
- RatingButtons: 4 rating buttons
- DeckDetailHeader: inline rename input
- GenerationFlow: 3 phase wrappers (input, reviewing, done)

**Out of scope:**

- Writing new Playwright tests (separate E2E change)
- Adding testids to elements reachable via accessible selectors (form inputs, unique-text buttons, nav links)
- Renaming `btn-generate`

## Architecture / Approach

Each change is a single `data-testid="..."` prop addition on an existing element. The one exception is `GenerationFlow`'s input phase, which renders `<TextInputForm>` directly with no wrapping element — a thin `<div data-testid="generation-phase-input">` wrapper is added there. No component interfaces change; no new files are created.

## Phases at a Glance

| Phase                  | What it delivers                                                                 | Key risk                                                                 |
| ---------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1. Core disambiguation | Testids on all repeating-row buttons (16), 6 modal roots, 1 flip-card div        | Missed a button variant in conditional render logic                      |
| 2. Supplementary       | RatingButtons (4), DeckDetailHeader input (1), GenerationFlow phase wrappers (3) | GenerationFlow wrapper div shifts layout — visually inspect after adding |

**Prerequisites:** Dev server running for manual verification (`npm run dev`)
**Estimated effort:** ~1 session across 2 phases; ~30 attribute additions total

## Open Risks & Assumptions

- Line numbers in research are approximate (~); implementer should read each file to confirm exact positions.
- `GenerationFlow` input phase wrapper div must not introduce visible layout shift — check `className` on the wrapper (leave empty or `contents`).
- If any modal uses a fragment or string as `createPortal`'s first arg instead of a `<div>`, the testid placement needs adjustment.

## Success Criteria (Summary)

- `npx playwright test` passes with zero failures (existing tests unaffected)
- `npm run typecheck` and `npm run lint` both pass
- Browser DevTools confirms `data-testid` on all targeted elements at each relevant page/state
