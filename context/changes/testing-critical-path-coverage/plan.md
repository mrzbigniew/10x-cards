# Phase 1 Critical-Path Coverage Implementation Plan

## Overview

Bootstrap the project's first test infrastructure (Vitest + MSW + Testing Library) and use it to protect the three critical-path risks from `context/foundation/test-plan.md` §3 Phase 1:

- **Risk #1** — AI generation returns malformed/empty proposals.
- **Risk #2** — deck-save writes partially (orphan deck on card-insert failure).
- **Risk #5** — generation flow drops pasted text on API error.

Each test asserts the **contract** (what the code should do, per PRD/domain), not a snapshot of current output. As part of Risk #2, this plan also fixes the underlying non-atomicity defect (orphan deck) so the test asserts a clean contract rather than documenting a bug.

## Current State Analysis

No test infrastructure exists: zero test deps, no `vitest.config.*`, no `*.test.*` files, no `test` script. The repo is **Astro 6** (`astro@^6.3.1`), npm, `output: "server"`, Cloudflare adapter, React 19, Vite pinned to `^7.3.2` via `overrides`. `tsconfig.json` extends `astro/tsconfigs/strict`, aliases `@/* → ./src/*`, and uses `react-jsx` / `jsxImportSource: "react"`.

The three targets are well-seamed:

- `generateProposals(text)` (`src/lib/services/generation.ts:27-73`) is a single async function: OpenRouter call via OpenAI SDK → `JSON.parse` → `z.array(ProposalSchema).safeParse` → empty-array guard, each failure throwing a `GenerationError` with a distinct Polish message.
- `createDeckWithCards()` (`src/lib/services/decks.ts:13-46`) does **two separate, non-atomic Supabase inserts** (deck, then cards) with **no rollback**. A failed card insert leaves an orphan deck. The service layer is dependency-injected (`SupabaseClientType`), so a hermetic stub client is trivial.
- `useGeneration.generate()` (`src/components/hooks/useGeneration.ts:27-59`) already preserves `text` and sets `phase="input"` in its catch branch. Only `reset()` clears `text`, and it is never called from the error path.

### Key Discoveries:

- **`astro:env/server` virtual module** (`src/lib/supabase.ts:3`, `src/lib/services/generation.ts:2`) will not resolve under plain Vitest — it must be aliased to a stub or mocked in setup. This is the single biggest infra gotcha.
- **Vite is pinned to `^7.3.2`** (`package.json:61-63`) — Vitest must be a Vite-7-compatible major (Vitest 3.x).
- **ESLint runs `strictTypeChecked` with `projectService`** (`eslint.config.js:14-21`) over `**/*` — test files are type-checked and linted. Test files must import Vitest globals explicitly (`import { describe, it, expect, vi } from "vitest"`) to avoid ambient-global config and stay clean under strict rules.
- **`createDeckWithCards` has `deleteDeck` available** (`src/lib/services/decks.ts:101-107`) but never calls it — the building block for the compensating-delete fix already exists.
- **`after_card_insert` trigger** (`supabase/migrations/20260526220447_initial_schema.sql`) inserts one `card_sr_state` row per card; `cards.deck_id → decks(id) ON DELETE CASCADE`. This is the integration side-effect deferred to ad-hoc.
- The five `GenerationError` messages are centralised, Polish, and stable — they are reliable oracles, not brittle snapshots.

## Desired End State

`npm run test` runs green with three risk suites plus a smoke test; `npm run lint` and `astro check` stay clean with the new test files present; `createDeckWithCards` no longer leaves an orphan deck on card-insert failure; Stryker confirms the Risk #1 suite kills meaningful mutants on `generation.ts`; test-plan §6 cookbook documents the three patterns and §3 Phase 1 status is updated.

## What We're NOT Doing

- **No CI changes.** Wiring tests + `astro check` into `.github/workflows/ci.yml` is test-plan §3 Phase 4. Phase 1 only adds npm scripts.
- **No real-Supabase integration test.** The happy-path row-count + trigger assertion is deferred and marked ad-hoc per CLAUDE.md doctrine; no local stack is assumed this session.
- **No whitespace-only validation change.** `ProposalSchema` `.min(1)` (not `.trim().min(1)`) accepting `" "` is accepted behaviour for Phase 1 — no dedicated test, no schema change.
- **No e2e, no a11y, no visual tests** (test-plan §7 negative space).
- **No changes to Risks #3/#4/#6** — those are Phases 2–3.
- **No transaction/RPC rewrite** of the save path — the compensating best-effort delete is the agreed scope, not a Postgres atomic-save function.

## Implementation Approach

Build the runner first (Phase 1) so every later phase has a green harness. Cover each risk with the cheapest layer that gives signal: `vi.mock` of the OpenAI SDK for Risk #1 (deterministic, drives every parse/validate branch), a hermetic stub Supabase client for Risk #2 (the only way to force a mid-sequence card failure), and `renderHook` + mocked `fetch` for Risk #5. Risk #2's test asserts the *desired* clean contract, so it is paired with the orphan-deck fix in the same phase. Finish with a Stryker validation pass on `generation.ts` and the cookbook/status handoff.

## Critical Implementation Details

- **`astro:env/server` resolution** — Vitest cannot resolve this virtual module. Resolve it once in the Vitest config via `resolve.alias` (or `test.alias`) pointing `astro:env/server` at a small stub module that exports the secrets as mutable values, OR `vi.mock("astro:env/server", ...)` in setup. Risk #1's "missing `OPENROUTER_API_KEY`" case and the configured case both need to toggle this value per test, so the stub must allow per-test override (mockable export, not a frozen constant).
- **ESLint `strictTypeChecked` over test files** — floating promises, `any`, and unsafe member access will error. Import Vitest globals explicitly; type stub clients against `SupabaseClientType` (cast through `unknown` only where unavoidable, with a localized eslint-disable comment naming the reason if needed).
- **Compensating-delete ordering (Risk #2 fix)** — on card-insert error, attempt `delete from decks where id = deck.id` (best-effort), then throw the *original* card-insert error. A failure of the cleanup delete must be caught and logged (warn), never masking the original error. The user sees one coherent error; the orphan is removed on the happy-cleanup path.

## Phase 1: Test Infrastructure Bootstrap

### Overview

Install and wire Vitest, MSW, jsdom, and Testing Library so the repo has a green test harness that respects the `@/*` alias and the `astro:env/server` virtual module, with npm scripts and a passing smoke test.

### Changes Required:

#### 1. Test dependencies

**File**: `package.json`

**Intent**: Add the Phase 1 test toolchain as devDependencies and expose run scripts. Add `zod` as an explicit dependency (currently only transitive) since service/schema tests import it.

**Contract**: New devDeps — `vitest` (3.x, Vite-7 compatible), `@vitest/coverage-v8`, `msw`, `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@stryker-mutator/core` + `@stryker-mutator/vitest-runner` (used in Phase 5). New scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:coverage": "vitest run --coverage"`. Promote `zod` to `dependencies`. Install with npm; pick versions via the package manager (do not hand-write versions).

#### 2. Vitest configuration

**File**: `vitest.config.ts` (new)

**Intent**: Configure Vitest to mirror the project's path alias, default to jsdom for component/hook tests, load a global setup file, and resolve the `astro:env/server` virtual module to a mockable stub.

**Contract**: `defineConfig({ test: { environment: "jsdom", globals: false, setupFiles: ["./vitest.setup.ts"], coverage: { provider: "v8" } }, resolve: { alias: { "@": "/src", "astro:env/server": <stub path> } } })`. `globals: false` keeps tests importing from `vitest` explicitly (lint-clean). Alias `@` to the absolute `src` path.

#### 3. Global setup + env stub

**File**: `vitest.setup.ts` (new), `src/test/astro-env-server.stub.ts` (new)

**Intent**: Provide a stub for `astro:env/server` whose exported secrets can be toggled per test, and register Testing Library cleanup. MSW server lifecycle is registered here only if a shared server is used; Risk #1 may instead mock the SDK directly (see Phase 2).

**Contract**: Stub module exports `let OPENROUTER_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY` (mutable, defaulting to a test value) so a test can override via `vi.mock`/assignment. `vitest.setup.ts` imports `@testing-library/react` `cleanup` in `afterEach`.

#### 4. Smoke test

**File**: `src/test/smoke.test.ts` (new)

**Intent**: Prove the harness runs, the alias resolves, and the `astro:env/server` stub loads.

**Contract**: A trivial `expect(true).toBe(true)` plus one `import` from `@/lib/schemas/generation` asserting `ProposalSchema` parses a valid `{front, back}` — confirms alias + zod wiring end to end.

### Success Criteria:

#### Automated Verification:

- Dependencies install cleanly: `npm install`
- Smoke test passes: `npm run test`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- `npm run test:watch` starts and re-runs on file change
- No `astro:env/server` resolution error appears in test output

**Implementation Note**: After automated verification passes, pause for human confirmation before Phase 2.

---

## Phase 2: Risk #1 — Generation Service Unit Tests

### Overview

Unit-test `generateProposals` against the full failure matrix and the happy-path contract, mocking the OpenAI SDK so every parse/validate/empty branch is driven deterministically.

### Changes Required:

#### 1. Generation service tests

**File**: `src/lib/services/generation.test.ts` (new)

**Intent**: Assert the contract — valid input yields a non-empty `{front, back}[]`; each malformed LLM output yields the specific `GenerationError` message; missing API key and SDK/network failure are handled. Mock the OpenAI SDK (`vi.mock("openai")`) and toggle `OPENROUTER_API_KEY` via the env stub.

**Contract**: Tests for the six rows of the research failure matrix —
  1. invalid/non-JSON/empty content → `"AI zwróciło nieprawidłową odpowiedź. Spróbuj ponownie."`
  2. parses but fails schema (wrong shape / empty strings / non-array) → `"AI zwróciło nieoczekiwany format odpowiedzi. Spróbuj ponownie."`
  3. valid but empty array `[]` → `"AI nie zwróciło żadnych propozycji. Spróbuj z dłuższym lub bardziej szczegółowym tekstem."`
  4. SDK throws → message starts with `"Żądanie do AI nie powiodło się:"`
  5. missing `OPENROUTER_API_KEY` → `"Generowanie AI nie jest skonfigurowane. Skontaktuj się z administratorem."`
  6. happy path → returns array, `length >= 1`, every element `front`/`back` non-empty.
Use `it.each` for the schema-rejection variants (one parameterised test per malformed shape) to avoid redundant copies. Assert error type is `GenerationError` and `.message` equals the oracle string — never a captured LLM payload.

### Success Criteria:

#### Automated Verification:

- Generation tests pass: `npm run test`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Each failure-matrix row maps to its exact Polish message (spot-check report output)
- No test asserts against a hardcoded LLM response snapshot

**Implementation Note**: Pause for human confirmation before Phase 3.

---

## Phase 3: Risk #2 — Orphan-Deck Fix + Hermetic Deck-Save Tests

### Overview

Fix the non-atomic save so a card-insert failure no longer leaves an orphan deck, then prove the save-to-deck contract with a hermetic stub Supabase client across both `createDeckWithCards` and `appendCardsToDeck`.

### Changes Required:

#### 1. Compensating-delete fix

**File**: `src/lib/services/decks.ts`

**Intent**: When the card insert in `createDeckWithCards` fails, remove the just-created deck (best-effort) before re-throwing the original card-insert error, so no orphan deck survives a partial save.

**Contract**: In the `cardsError` branch (`decks.ts:40-42`), attempt a delete of the created deck by id; wrap the cleanup in its own try/catch and `console.warn` on cleanup failure; then `throw new Error(cardsError.message)` (original error preserved). Reuse the existing delete-by-id pattern (`deleteDeck` logic) — ownership filter is unnecessary here since the deck was just created for `userId`, but keep the `user_id` filter for defense in depth.

#### 2. Hermetic stub client + deck-save tests

**File**: `src/lib/services/decks.test.ts` (new), `src/test/supabase-stub.ts` (new)

**Intent**: Build a typed stub Supabase client whose per-table `insert`/`select`/`delete` results are configurable per test, then assert the save contract and the orphan fix.

**Contract**: Stub exposes a builder typed against `SupabaseClientType` whose `from(table)` returns chainable `insert/select/single/delete/eq` resolving to caller-supplied `{ data, error }`. Tests:
  - `createDeckWithCards` happy path → returns `{ deckId }`; cards insert called with mapped `{front, back, source:"ai", deck_id, user_id}`.
  - **card insert fails → service throws the original error AND a delete on `decks` for the created id was issued** (assert orphan cleanup); no `{ deckId }` returned.
  - cleanup delete itself fails → original card error still thrown, `console.warn` invoked, no masking.
  - `cards.length === 0` → no card insert attempted.
  - `appendCardsToDeck`: ownership select error → throws `"Deck not found or access denied"`; insert error → throws; `cards.length === 0` → early return, no insert.

#### 3. Deferred integration note

**File**: `src/lib/services/decks.test.ts` (new) — `it.skip` or `describe.skip` block

**Intent**: Record the deferred happy-path integration assertion (COUNT(cards)=N and COUNT(card_sr_state)=N via the `after_card_insert` trigger) as a skipped, documented placeholder so the ad-hoc gate is visible in code, not just in the test plan.

**Contract**: A `describe.skip("integration (ad-hoc, requires local Supabase)", ...)` containing a commented outline of the row-count + trigger assertion and a reference to test-plan §4.

### Success Criteria:

#### Automated Verification:

- Deck-save tests pass: `npm run test`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- The orphan-cleanup assertion fails if the compensating delete is removed (confirm the test actually guards the fix)
- The deferred integration block is skipped, not deleted, and references §4

**Implementation Note**: Pause for human confirmation before Phase 4.

---

## Phase 4: Risk #5 — Generation Hook Error-Recovery Test

### Overview

Pin the error-recovery contract of `useGeneration`: after a failed generate, the pasted text survives, the phase returns to input, an error is shown, and a retry is possible without re-pasting.

### Changes Required:

#### 1. useGeneration hook test

**File**: `src/components/hooks/useGeneration.test.ts` (new)

**Intent**: Use `renderHook` + a mocked `fetch` that rejects (and a non-2xx variant) to assert the catch branch preserves `text`, resets `phase`, sets `errorMessage`, and allows a second `generate()`.

**Contract**: Mock global `fetch` (`vi.stubGlobal`/`vi.fn`). With `setText("...notes...")` then `await act(generate)` under a rejected fetch: assert `result.current.text` unchanged, `result.current.phase === "input"`, `result.current.errorMessage` truthy. Cover both failure modes — fetch reject and `res.ok === false` (error JSON body → thrown message surfaces). Then a second `generate()` with fetch succeeding moves `phase` to `"reviewing"` without re-setting text (retry-without-repaste).

### Success Criteria:

#### Automated Verification:

- Hook tests pass: `npm run test`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Removing the `setPhase("input")` line or clearing text in the catch branch makes the test fail (guards the real regression)

**Implementation Note**: Pause for human confirmation before Phase 5.

---

## Phase 5: Hardening & Handoff

### Overview

Validate the Risk #1 suite with mutation testing, document the three test patterns in the cookbook, and sync the rollout status.

### Changes Required:

#### 1. Stryker pass on the generation service

**File**: `stryker.conf.json` (new)

**Intent**: Configure Stryker with the Vitest runner scoped to `generation.ts`, run it as a selective gate, and either kill survived mutants with new assertions or consciously ignore equivalents.

**Contract**: Stryker config with `testRunner: "vitest"`, `mutate: ["src/lib/services/generation.ts"]`. Run `npx stryker run`; review the HTML report; for each survivor ask "would this hurt a user/business?" — add an assertion in `generation.test.ts` if yes, document the ignore if no. Do not chase 100%.

#### 2. Cookbook update

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the TBD slots §6.1 (service unit test), §6.2 (API/route — hermetic save pattern, integration deferred), §6.3 (React hook) with the concrete patterns shipped, and note the per-phase notes in §6.5.

**Contract**: Prose pattern entries referencing the real test files and the key conventions (vi.mock the SDK; explicit Vitest imports; stub client typed against `SupabaseClientType`; `renderHook` + mocked fetch; `astro:env/server` stub). §6.2 records that the hermetic partial-failure pattern shipped and the integration count/trigger assertion is deferred/ad-hoc.

#### 3. Rollout status sync

**File**: `context/foundation/test-plan.md`, `context/changes/testing-critical-path-coverage/change.md`

**Intent**: Move §3 Phase 1 Status from `change opened` to its shipped value and stamp the change as complete-ready.

**Contract**: Update the §3 row 1 Status cell; set `change.md` `status` and `updated` accordingly.

### Success Criteria:

#### Automated Verification:

- Full suite passes: `npm run test`
- Coverage report generates: `npm run test:coverage`
- Stryker run completes and report is generated: `npx stryker run`
- Linting passes: `npm run lint`

#### Manual Verification:

- Stryker survivors triaged (each killed or consciously ignored with a note)
- Cookbook §6.1/§6.2/§6.3 read as usable patterns, not TBD
- Test-plan §3 Phase 1 Status reflects shipped state

**Implementation Note**: Final phase — confirm the full suite and the handoff edits with the human.

---

## Testing Strategy

### Unit Tests:

- `generation.ts` — failure matrix (5 distinct errors) + happy-path contract (Risk #1).
- `decks.ts` — hermetic stub: orphan cleanup on partial failure, empty-cards skip, `appendCardsToDeck` ownership/insert errors (Risk #2).
- `useGeneration.ts` — error-recovery: text preserved, phase reset, retry (Risk #5).

### Integration Tests:

- Deferred (ad-hoc): happy-path row counts + `after_card_insert` trigger against a real test DB. Captured as a `describe.skip` placeholder referencing test-plan §4.

### Manual Testing Steps:

1. Run `npm run test` — all suites green.
2. Temporarily remove the compensating delete — confirm the Risk #2 orphan test goes red.
3. Temporarily clear `text` in the hook catch branch — confirm the Risk #5 test goes red.
4. Open the Stryker HTML report — confirm survivors are triaged.

## Performance Considerations

Negligible — all Phase 1 tests are hermetic/mocked (no network, no real DB). Stryker is selectively scoped to one file to keep mutation runtime bounded.

## Migration Notes

The compensating-delete change to `createDeckWithCards` is behaviour-preserving on the happy path and only adds cleanup on the existing error path; no data migration. `ON DELETE CASCADE` means deleting the orphan deck also clears any partially-inserted dependent rows.

## References

- Research: `context/changes/testing-critical-path-coverage/research.md`
- Test plan: `context/foundation/test-plan.md` (§2 risks, §3 Phase 1, §4 stack, §6 cookbook)
- Risk #1: `src/lib/services/generation.ts:20-73`, `src/lib/schemas/generation.ts:7-10`
- Risk #2: `src/lib/services/decks.ts:13-46`, `src/lib/services/decks.ts:101-141`, `supabase/migrations/20260526220447_initial_schema.sql`
- Risk #5: `src/components/hooks/useGeneration.ts:27-59`
- Lint constraints: `eslint.config.js:14-21`; alias/JSX: `tsconfig.json:5-12`; Vite pin: `package.json:61-63`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Test Infrastructure Bootstrap

#### Automated

- [ ] 1.1 Dependencies install cleanly: `npm install`
- [ ] 1.2 Smoke test passes: `npm run test`
- [ ] 1.3 Type checking passes: `npx astro check`
- [ ] 1.4 Linting passes: `npm run lint`

#### Manual

- [ ] 1.5 `npm run test:watch` starts and re-runs on file change
- [ ] 1.6 No `astro:env/server` resolution error in test output

### Phase 2: Risk #1 — Generation Service Unit Tests

#### Automated

- [ ] 2.1 Generation tests pass: `npm run test`
- [ ] 2.2 Type checking passes: `npx astro check`
- [ ] 2.3 Linting passes: `npm run lint`

#### Manual

- [ ] 2.4 Each failure-matrix row maps to its exact Polish message
- [ ] 2.5 No test asserts against a hardcoded LLM response snapshot

### Phase 3: Risk #2 — Orphan-Deck Fix + Hermetic Deck-Save Tests

#### Automated

- [ ] 3.1 Deck-save tests pass: `npm run test`
- [ ] 3.2 Type checking passes: `npx astro check`
- [ ] 3.3 Linting passes: `npm run lint`

#### Manual

- [ ] 3.4 Removing the compensating delete makes the orphan test fail
- [ ] 3.5 Deferred integration block is skipped (not deleted) and references §4

### Phase 4: Risk #5 — Generation Hook Error-Recovery Test

#### Automated

- [ ] 4.1 Hook tests pass: `npm run test`
- [ ] 4.2 Type checking passes: `npx astro check`
- [ ] 4.3 Linting passes: `npm run lint`

#### Manual

- [ ] 4.4 Clearing text / dropping phase reset in the catch branch makes the test fail

### Phase 5: Hardening & Handoff

#### Automated

- [ ] 5.1 Full suite passes: `npm run test`
- [ ] 5.2 Coverage report generates: `npm run test:coverage`
- [ ] 5.3 Stryker run completes and report generated: `npx stryker run`
- [ ] 5.4 Linting passes: `npm run lint`

#### Manual

- [ ] 5.5 Stryker survivors triaged (killed or consciously ignored)
- [ ] 5.6 Cookbook §6.1/§6.2/§6.3 read as usable patterns
- [ ] 5.7 Test-plan §3 Phase 1 Status reflects shipped state
