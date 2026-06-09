# data-testid Coverage for Playwright Tests — Implementation Plan

## Overview

Add `data-testid` attributes to interactive elements across 10 component files so Playwright tests can target them without ambiguity. The existing `data-testid="btn-generate"` in `TextInputForm.tsx` is left unchanged to avoid breaking existing tests. All new testids follow the `[component-context]-[element-type]-[action]` / `modal-[name]` convention established in the research doc.

## Current State Analysis

- **95 interactive elements** across 20+ component files; only **1** (`btn-generate`) has a `data-testid`.
- Existing E2E tests (`tests/generation-error-recovery.spec.ts`, `tests/seed.spec.ts`) rely on `btn-generate` — this attribute must not be changed.
- Ambiguity sources: repeating-row components (DeckRow, ProposalRow, CardRow) render the same button roles N times; icon-only buttons use `title` not `aria-label`; the flip-card div has no semantic role; modal containers have no stable identity.
- Per CLAUDE.md rules: `getByTestId` is a fallback — `getByRole` / `getByLabel` / `getByText` stay the primary selectors. `data-testid` is justified only where accessibility attributes are genuinely ambiguous.

## Desired End State

Every Playwright test that targets a row-level action button, a modal container, the flip-card, or a phase view can do so via a stable `data-testid`, using `getByRole(...).filter({ hasText: rowIdentifier }).getByTestId(...)` for per-row disambiguation. No existing tests break. TypeScript and lint pass.

### Key Discoveries

- `src/components/decks/DeckRow.tsx:25–62` — 4 icon-only buttons using `title` (not `aria-label`); `getByRole` is ambiguous when N deck rows are rendered.
- `src/components/generation/ProposalRow.tsx:68–129` — 6 buttons per row; lists of 5–15 proposals create 5–15 identical button names.
- `src/components/CardRow.tsx:67–180` — 6 buttons per row; same per-row ambiguity.
- `src/components/review/ReviewSession.tsx:96–99` — flip-card is a `<div onClick={flip}>` with no semantic role.
- All 6 modals use `createPortal` (per lessons.md rule) — the `data-testid` goes on the outermost `<div>` inside the `createPortal(...)` call.
- `src/components/generation/GenerationFlow.tsx` — 3 conditional returns; the input/generating return renders `<TextInputForm>` directly (no wrapping div) and needs a wrapper for the phase testid.

## What We're NOT Doing

- Renaming `btn-generate` — would break `tests/generation-error-recovery.spec.ts` and `tests/seed.spec.ts`.
- Adding testids to elements reachable via accessible selectors (all form inputs, submit buttons with unique text, nav links, bulk-action buttons with count, theme/password toggle).
- Writing new Playwright tests — this change only instruments the DOM; new tests come in a separate E2E change.
- Adding testids to `GenerationFlow`'s `saving` state separately — it shares the same UI div as `reviewing`.

## Implementation Approach

Each change is a single `data-testid="..."` prop addition on an existing element (or a thin wrapping `<div>` in one case). Changes are grouped into two phases so Phase 1 can be verified and used independently before Phase 2 adds the supplementary coverage.

---

## Phase 1: Core Disambiguation Testids

### Overview

Add testids to the elements that directly cause Playwright ambiguity: repeating-row buttons in DeckRow, ProposalRow, and CardRow; root containers of all six modals; and the flip-card div in ReviewSession.

### Changes Required

#### 1. DeckRow action buttons

**File**: `src/components/decks/DeckRow.tsx`

**Intent**: Add a unique `data-testid` to each of the 4 icon-only action buttons so Playwright can target "the delete button in deck row X" without ambiguity.

**Contract**: Add `data-testid` props at the following lines:

- Line ~28 (Powtórz button): `data-testid="deck-row-btn-review"`
- Line ~38 (Generuj fiszki button): `data-testid="deck-row-btn-generate"`
- Line ~48 (Resetuj postępy button): `data-testid="deck-row-btn-reset-progress"`
- Line ~57 (Usuń button): `data-testid="deck-row-btn-delete"`

#### 2. ProposalRow action buttons

**File**: `src/components/generation/ProposalRow.tsx`

**Intent**: Add a unique `data-testid` to each of the 6 action buttons per proposal row so tests can target "the accept button in proposal row X" without enumerating all matching buttons.

**Contract**: Add `data-testid` props:

- Line ~96–103 (Akceptuj): `data-testid="proposal-row-btn-accept"`
- Line ~105–110 (Edytuj): `data-testid="proposal-row-btn-edit"`
- Line ~111–118 (Odrzuć): `data-testid="proposal-row-btn-reject"`
- Line ~122–129 (Cofnij): `data-testid="proposal-row-btn-undo"`
- Line ~68–73 (Potwierdź — edit mode): `data-testid="proposal-row-btn-confirm-edit"`
- Line ~75–80 (Anuluj — edit mode): `data-testid="proposal-row-btn-cancel-edit"`

#### 3. CardRow action buttons

**File**: `src/components/CardRow.tsx`

**Intent**: Add a unique `data-testid` to each of the 6 action buttons per card row for the same per-row disambiguation reason.

**Contract**: Add `data-testid` props:

- Line ~167–171 (Edytuj): `data-testid="card-row-btn-edit"`
- Line ~173–180 (Usuń): `data-testid="card-row-btn-delete"`
- Line ~139–145 (Zapisz — edit mode): `data-testid="card-row-btn-save"`
- Line ~146–154 (Anuluj — edit mode cancel): `data-testid="card-row-btn-cancel-edit"`
- Line ~67–73 (Tak, usuń — confirm delete inline dialog): `data-testid="card-row-btn-confirm-delete"`
- Line ~74–82 (Anuluj — cancel delete): `data-testid="card-row-btn-cancel-delete"`

#### 4. Modal root containers

**Files**:

- `src/components/generation/GenerationModal.tsx`
- `src/components/review/ReviewModal.tsx`
- `src/components/AddCardModal.tsx`
- `src/components/decks/CreateDeckModal.tsx`
- `src/components/decks/DeleteDeckModal.tsx`
- `src/components/decks/ResetProgressModal.tsx`

**Intent**: Give each modal's root element a stable testid so E2E tests can assert the modal is open or closed without relying on heading text.

**Contract**: Add `data-testid` on the outermost `<div>` inside each `createPortal(...)` call — not on the portal call itself. Testids:

- GenerationModal: `data-testid="modal-generation"`
- ReviewModal: `data-testid="modal-review"`
- AddCardModal: `data-testid="modal-add-card"`
- CreateDeckModal: `data-testid="modal-create-deck"`
- DeleteDeckModal: `data-testid="modal-delete-deck"`
- ResetProgressModal: `data-testid="modal-reset-progress"`

#### 5. ReviewSession flip-card div

**File**: `src/components/review/ReviewSession.tsx`

**Intent**: Give the flip-card `<div onClick={flip}>` a stable testid so E2E tests can click it without resorting to CSS selectors or XPath.

**Contract**: Add `data-testid="review-card-flipper"` to the `<div>` at line ~96–99 that carries `onClick={flip}`.

### Success Criteria

#### Automated Verification

- TypeScript passes: `npm run typecheck`
- Lint passes: `npm run lint`
- Existing Vitest unit tests pass: `npm test`
- Existing Playwright tests pass: `npx playwright test`

#### Manual Verification

- Open any deck list page in the browser; inspect a DeckRow — confirm all 4 buttons carry their `data-testid` values.
- Open a generation modal and inspect its root `<div>` — confirm `data-testid="modal-generation"` is present.
- Open a review session; inspect the flip-card div — confirm `data-testid="review-card-flipper"`.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Supplementary Testids

### Overview

Add testids to elements that are currently unambiguous but would benefit from a stable anchor: RatingButtons (robust against copy changes), DeckDetailHeader rename input (robust against future page additions), and GenerationFlow phase wrappers (enables explicit phase assertions in E2E tests).

### Changes Required

#### 1. RatingButtons

**File**: `src/components/review/RatingButtons.tsx`

**Intent**: Add testids to the 4 rating buttons so review-session E2E tests remain stable if the Polish button labels change.

**Contract**: Add `data-testid` props to the 4 buttons at lines ~39–50:

- "Raz jeszcze": `data-testid="rating-btn-again"`
- "Trudna": `data-testid="rating-btn-hard"`
- "Dobra": `data-testid="rating-btn-good"`
- "Łatwa": `data-testid="rating-btn-easy"`

#### 2. DeckDetailHeader rename input

**File**: `src/components/decks/DeckDetailHeader.tsx`

**Intent**: Add a testid to the conditional inline rename input so E2E deck-rename tests have a stable, explicit anchor rather than relying on "only textbox on the page."

**Contract**: Add `data-testid="deck-header-input-name"` to the `<input>` (or controlled input component) at lines ~55–69 that renders when the deck name is in edit mode.

#### 3. GenerationFlow phase wrappers

**File**: `src/components/generation/GenerationFlow.tsx`

**Intent**: Add a testid to each conditional return's root element so E2E tests can assert which generation phase is currently active.

**Contract**: Three testids across the three conditional branches:

- Done branch (line ~43 `<div className="py-16 text-center">`): add `data-testid="generation-phase-done"`
- Reviewing/saving branch (line ~61 `<div className="space-y-8">`): add `data-testid="generation-phase-reviewing"`
- Input/generating branch: the final return renders `<TextInputForm>` directly with no wrapping element. Wrap it in `<div data-testid="generation-phase-input">...</div>` to provide the testid without changing TextInputForm's interface.

### Success Criteria

#### Automated Verification

- TypeScript passes: `npm run typecheck`
- Lint passes: `npm run lint`
- Existing Vitest unit tests pass: `npm test`
- Existing Playwright tests pass: `npx playwright test`

#### Manual Verification

- Open a review session; inspect the rating buttons — confirm all 4 have their `data-testid` values.
- Navigate to a deck detail page and trigger inline deck rename — inspect the input, confirm `data-testid="deck-header-input-name"`.
- Open the generation page; inspect the root element at each phase (`input`, `reviewing` after generating, `done` after saving) — confirm the correct `generation-phase-*` testid is on the outermost div.

---

## Testing Strategy

### Automated Tests

No new test files are added in this change. All verification is:

- `npm run typecheck` — no type errors introduced
- `npm run lint` — no lint violations
- `npm test` — existing Vitest unit tests unaffected (they don't touch these DOM attributes)
- `npx playwright test` — existing E2E tests still pass (only `btn-generate` is referenced; it is not changed)

### Manual Testing Steps

1. `npm run dev` — start the dev server
2. Open browser DevTools and inspect one DeckRow; confirm 4 `data-testid` attributes on its action buttons
3. Generate flashcards; confirm `generation-phase-input` on the form wrapper, `generation-phase-reviewing` on the proposal+save view
4. Open any modal; confirm the `modal-*` testid on its root div
5. Run a review session; flip a card and check `review-card-flipper`; rate a card and check `rating-btn-*`

## References

- Research: `context/changes/tests-data-testid/research.md`
- Existing testid anchor: `src/components/generation/TextInputForm.tsx:56`
- Existing E2E tests: `tests/generation-error-recovery.spec.ts`, `tests/seed.spec.ts`
- Playwright config: `playwright.config.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Core Disambiguation Testids

#### Automated

- [x] 1.1 TypeScript passes: `npm run typecheck`
- [x] 1.2 Lint passes: `npm run lint`
- [x] 1.3 Existing Vitest unit tests pass: `npm test`
- [x] 1.4 Existing Playwright tests pass: `npx playwright test`

#### Manual

- [x] 1.5 DeckRow buttons carry correct `data-testid` values in browser DevTools
- [x] 1.6 Modal root `<div>` carries correct `data-testid` in browser DevTools
- [x] 1.7 ReviewSession flip-card div carries `data-testid="review-card-flipper"`

### Phase 2: Supplementary Testids

#### Automated

- [ ] 2.1 TypeScript passes: `npm run typecheck`
- [ ] 2.2 Lint passes: `npm run lint`
- [ ] 2.3 Existing Vitest unit tests pass: `npm test`
- [ ] 2.4 Existing Playwright tests pass: `npx playwright test`

#### Manual

- [ ] 2.5 RatingButtons carry correct `data-testid` values
- [ ] 2.6 DeckDetailHeader rename input carries `data-testid="deck-header-input-name"` when in edit mode
- [ ] 2.7 GenerationFlow phase wrappers carry correct `generation-phase-*` testids at each phase
