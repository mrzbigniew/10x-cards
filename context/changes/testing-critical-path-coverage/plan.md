# Critical-Path Coverage — Implementation Plan

## Overview

Bootstrap the remaining test infrastructure gaps and write three risk-covering test suites (generation output validity, deck-save atomicity, generation error recovery) per `context/foundation/test-plan.md` §3 Phase 1. Includes a behavior fix to `ProposalSchema` (`.trim().min(1)`) and a bug fix to `createDeckWithCards` (compensating delete on card-insert failure), each proven by its own test.

## Current State Analysis

- Vitest 4.x, jsdom, Testing Library, coverage-v8, MSW, and Stryker are all installed.
- `vitest.config.ts` uses `getViteConfig` + `@astrojs/node` adapter; references `./vitest.setup.ts` which does not exist yet — any `npm run test` call will error before this is created.
- `package.json` scripts: `test` → `vitest run`, `test:watch` → `vitest`, `test:coverage` → `vitest run --coverage`. No `test:mutation` script.
- `stryker.config.json` mutates `src/**/*.ts` — too broad for selective-gate use.
- No test files exist anywhere.
- `ProposalSchema` (`src/lib/schemas/generation.ts:7-10`) has `.min(1)` on `front` and `back` — whitespace-only strings pass validation today.
- `createDeckWithCards` (`src/lib/services/decks.ts:13-46`) has no compensating delete when card insert fails; orphan decks can persist in the database.

## Desired End State

- `vitest.setup.ts` exists; `npm run test` runs clean with no setup file error.
- `ProposalSchema` rejects whitespace-only strings on both `front` and `back`.
- Three test suites covering all failure-matrix entries for Risks #1, #2, and #5.
- `createDeckWithCards` deletes the newly created deck when card insert fails.
- `npm run test:mutation` runs Stryker scoped to `generation.ts`; all surviving mutants reviewed.
- `test-plan.md §6` cookbook entries filled for all three test types established here.

### Key Discoveries

- `vitest.config.ts:14` references `./vitest.setup.ts` (missing — must exist before any test run)
- `generation.ts:2` imports `OPENROUTER_API_KEY` from `"astro:env/server"` — requires `vi.mock("astro:env/server", ...)` in test files; a getter pattern allows per-test key toggling without `vi.resetModules()`
- `decks.ts:101-107` — `deleteDeck(supabase, userId, deckId)` already exists; it is the seam for the compensating-delete fix
- Risk #2 hermetic stub must shape-match `SupabaseClientType = NonNullable<ReturnType<typeof createClient>>`; the fluent chain (`.from(...).insert(...).select(...).single()`) must be stubbed at every level
- `useGeneration.ts:32` calls `fetch` directly — mock via `vi.spyOn(globalThis, "fetch")`
- `appendCardsToDeck` already has an early return for `cards.length === 0` at `decks.ts:126`; this is the path tested in Phase 3 for the empty-cards skip case

## What We're NOT Doing

- Integration tests against a real Supabase DB — deferred; a skipped placeholder preserves the intent per test-plan §4
- MSW server setup — not needed for Phase 1; `vi.spyOn` on `fetch` is cheaper and sufficient for the hook test
- `@testing-library/jest-dom` matchers — not installed; Vitest native `expect` is sufficient
- Stryker config broad-glob cleanup — `stryker.config.json`'s default glob is left as the global default; the `test:mutation` script overrides scope via CLI flag
- Coverage CI gate — Phase 4 of the rollout (test-plan §5)

## Implementation Approach

Five phases progress from infrastructure → schema fix → three risk suites → mutation gate + cookbook. Risk #2 uses TDD: the hermetic test is written first (red), then `createDeckWithCards` is fixed (green). All test files live in `src/test/`. Each suite uses the cheapest layer that gives a real signal: `vi.mock("openai")` for the generation service, a typed Supabase stub for the deck service, and `vi.spyOn(globalThis, "fetch")` for the hook.

## Critical Implementation Details

**`astro:env/server` per-test key toggling.** `vi.mock` is hoisted before imports, so the factory runs once. To toggle `OPENROUTER_API_KEY` between present and absent across different test cases without `vi.resetModules()`, declare a mutable `let mockApiKey` in module scope and return it via a getter from the mock factory:

```ts
let mockApiKey: string | undefined = "test-key";
vi.mock("astro:env/server", () => ({
  get OPENROUTER_API_KEY() { return mockApiKey; },
}));
```

Assign `mockApiKey` in `beforeEach` or per test to switch between `"test-key"` (SDK tests) and `undefined` (missing-key test).

**Supabase fluent builder stub.** The Supabase client exposes a fluent chain (`.from().insert().select().single()`, `.from().delete().eq().eq().select().single()`). The stub must return a fresh chainable object at each level so the chain doesn't throw on a missing method. Use `vi.fn()` only at the terminal async operations (`.single()`, bare `.insert()`), and have each intermediate method return the same stub object.

**TDD ordering for Phase 3.** `src/test/decks.test.ts` is committed before any change to `decks.ts`. The orphan-guard assertion starts red. The fix to `createDeckWithCards` is a separate commit that turns it green. This ordering must be preserved so the TDD trace is visible in git history.

---

## Phase 1: Environment & Schema Fix

### Overview

Create `vitest.setup.ts` so the config reference doesn't error, fix `ProposalSchema` to reject whitespace-only values, and add the `test:mutation` script. No test suites are written here — the goal is a clean `npm run test` (zero test files → passes trivially) and the schema contract in place before Phase 2 exercises it.

### Changes Required

#### 1. Create `vitest.setup.ts`

**File**: `vitest.setup.ts`

**Intent**: Satisfy the `setupFiles: ["./vitest.setup.ts"]` reference in `vitest.config.ts:14`. Without this file, Vitest errors before running any tests. Phase 2+ can register global mocks here if needed.

**Contract**: An empty TypeScript file with a single `export {}` is sufficient for Phase 1. Must use LF line endings.

#### 2. Fix `ProposalSchema` whitespace validation

**File**: `src/lib/schemas/generation.ts`

**Intent**: `ProposalSchema.front` and `.back` currently accept whitespace-only strings because `.min(1)` counts space characters. `.trim().min(1)` rejects them and normalises surrounding whitespace on valid content — a behavior change the Phase 2 test explicitly covers.

**Contract**: Change `front: z.string().min(1)` and `back: z.string().min(1)` at lines 8-9 to `.trim().min(1)`. `GenerateRequestSchema.text` at line 4 is unchanged.

#### 3. Add `test:mutation` script

**File**: `package.json`

**Intent**: Provide a single command that runs Stryker scoped to `generation.ts`, honouring the selective-gate doctrine in AGENTS.md. The broad `mutate` glob in `stryker.config.json` is left unchanged as the global fallback; this script overrides it via CLI flag for this change.

**Contract**: Add `"test:mutation": "stryker run --mutate \"src/lib/services/generation.ts\""` to the `scripts` block.

### Success Criteria

#### Automated Verification

- `npm run test` exits 0 (zero test files — passes trivially; no setup-file load error)
- `npm run typecheck` passes with the `.trim().min(1)` change
- `npm run lint` passes

#### Manual Verification

- `vitest.setup.ts` exists at repo root
- `npm run test:mutation -- --help` prints Stryker help (validates the script is wired)

**Implementation Note**: After all automated verification passes, pause for manual confirmation before proceeding to Phase 2. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes live in `## Progress`.

---

## Phase 2: Risk #1 — Generation Unit Tests

### Overview

Write the full unit test suite for `generateProposals()` covering all six failure-matrix entries from the research doc, the happy path, and the whitespace edge case introduced by the Phase 1 schema fix.

### Changes Required

#### 1. Create generation test file

**File**: `src/test/generation.test.ts`

**Intent**: Cover every distinct error path in `generateProposals()` with one parameterised test each, one happy-path test, and one whitespace edge case. The oracle for each assertion is the specific Polish error message from `generation.ts`, not a snapshot of LLM output or a value computed by re-running the same logic.

**Contract**: Mock setup (hoisted via `vi.mock` at top of file — see Critical Implementation Details for the getter pattern). Six `it.each` rows matching the research failure matrix:

| Row | Scenario | Expected thrown message |
|-----|----------|------------------------|
| 1 | `OPENROUTER_API_KEY` is `undefined` | `"Generowanie AI nie jest skonfigurowane..."` |
| 2 | SDK throws `Error` | `` `Żądanie do AI nie powiodło się: ${message}` `` |
| 3 | SDK throws non-Error | `"Żądanie do AI nie powiodło się: Unknown error from AI provider"` |
| 4 | Content is non-JSON / empty string | `"AI zwróciło nieprawidłową odpowiedź..."` |
| 5 | Content parses but fails schema (wrong shape; empty strings; `null`) | `"AI zwróciło nieoczekiwany format odpowiedzi..."` |
| 6 | Valid array but `length === 0` | `"AI nie zwróciło żadnych propozycji..."` |

Happy-path test: mock returns `[{ front: "Q", back: "A" }]`; assert result length ≥ 1 and each item has non-empty `front` and `back`.

Whitespace edge case: mock returns `[{ front: " ", back: "valid" }]`; assert the schema-failure message (#5) is thrown (the `.trim().min(1)` change now rejects the whitespace front).

All tests assert `instanceof GenerationError` in addition to the message.

#### 2. Verify `astro:env/server` resolves under `getViteConfig`

**File**: `src/test/generation.test.ts` (verified by the test run itself)

**Intent**: Confirm the virtual module resolves and the `vi.mock` factory intercepts it. If the run fails with a module-not-found error (not a test-assertion failure), the implementer must add an explicit `alias` entry in `vitest.config.ts` pointing `astro:env/server` to a stub module — this is the fallback if `getViteConfig` doesn't carry the env plugin in the test context.

**Contract**: No separate file unless the fallback is needed. The signal is the error type: `Cannot find module 'astro:env/server'` → add alias; `AssertionError` → test logic issue.

### Success Criteria

#### Automated Verification

- `npm run test` passes with a minimum of 8 generation test cases green
- `npm run typecheck` passes
- `npm run lint` passes

#### Manual Verification

- Each of the six Polish error messages appears in a test description or assertion comment so failures are debuggable without reading source
- No test derives its expected value by re-running the same parsing/validation logic (no mirror tests)

**Implementation Note**: Pause after automated verification for manual review of test descriptions and oracle sourcing.

---

## Phase 3: Risk #2 — Deck Atomicity (TDD)

### Overview

Write the hermetic stub test for `createDeckWithCards` **first** (it starts red because the compensating delete does not exist yet), then fix the function. Also cover the `cards: []` skip and `appendCardsToDeck` error paths. Implemented via `/10x-tdd`.

### Changes Required

#### 1. Create deck service test file (written first — starts red)

**File**: `src/test/decks.test.ts`

**Intent**: Assert the desired contract for `createDeckWithCards`: when card insert fails, the service (a) throws an error, (b) calls the compensating delete on the newly created deck id. Also assert `cards: []` returns `{ deckId }` without touching the card table, and that `appendCardsToDeck` throws on ownership failure and on card insert failure. The orphan-guard test is written before the fix and starts red — that is the point.

**Contract**: The Supabase stub follows the fluent builder pattern described in Critical Implementation Details. The stub exposes `vi.fn()` references for the terminal operations so tests can assert call counts and arguments. The integration placeholder is added as a `describe.skip` block at the end of the file with a single `it.todo` naming the deferred assertions (deck row count = N cards; `card_sr_state` count = N).

#### 2. Fix `createDeckWithCards` — compensating delete

**File**: `src/lib/services/decks.ts`

**Intent**: When `cardsError` is truthy at line 40, issue a best-effort `deleteDeck` call before re-throwing. If the delete itself fails, swallow that error and still re-throw the original card insert error. The user always sees the error; the orphan deck is cleaned up on a best-effort basis.

**Contract**: Wrap the compensating delete in a `try/catch` that does not mask the original error. The existing `deleteDeck` function (`decks.ts:101-107`) is called with `(supabase, userId, deck.id)`. Function signature and return type are unchanged.

### Success Criteria

#### Automated Verification

- All deck tests pass (orphan-guard test goes green after the fix)
- `npm run test` green across all suites
- `npm run typecheck` passes
- `npm run lint` passes

#### Manual Verification

- Git log shows `src/test/decks.test.ts` committed before the `decks.ts` fix (TDD ordering preserved)
- `cards: []` test asserts the card-table stub method was not called

**Implementation Note**: Pause after automated verification. Confirm TDD red→green trace is visible in git history before proceeding.

---

## Phase 4: Risk #5 — Hook Error Recovery Tests

### Overview

Write unit tests for `useGeneration`'s error branch using `renderHook` from Testing Library. Mock `fetch` to return failures; pin that `text` is preserved, `phase` returns to `"input"`, and `errorMessage` is set. Also pin that a successful retry after an error works without re-paste.

### Changes Required

#### 1. Create hook test file

**File**: `src/test/useGeneration.test.ts`

**Intent**: Cover the catch branch in `useGeneration.generate()` (lines 54–58): after an API error, `text` is not touched, `phase` is `"input"`, and `errorMessage` is a non-empty string. Cover both the `!res.ok` path (non-200 response) and the network-reject path (fetch throws). Pin the retry: a second `generate()` call that succeeds should advance to `phase === "reviewing"` with the original `text` still intact and proposals populated.

**Contract**: Mock via `vi.spyOn(globalThis, "fetch")`. Restore after each test with `vi.restoreAllMocks()`. Wrap async state updates in `act()` from React. Do not import or assert on internal state variables — only the values returned by `renderHook`.

#### 2. Add integration placeholder to `src/test/decks.test.ts`

**File**: `src/test/decks.test.ts` (append)

**Intent**: Satisfy test-plan §4 doctrine — record the deferred integration assertion as a skipped block so the intent is not lost and the file is self-documenting about what's missing.

**Contract**: A `describe.skip("integration: createDeckWithCards happy path — deferred", () => { it.todo("deck row count = N, card_sr_state count = N after successful save") })` block at the end of the file. No real Supabase client is needed or referenced.

### Success Criteria

#### Automated Verification

- All hook tests pass
- `npm run test` green across all three suites
- `npm run typecheck` passes
- `npm run lint` passes

#### Manual Verification

- `!res.ok` branch and network-reject branch have distinct test cases
- No hook-internal state is imported or asserted — only returned values

**Implementation Note**: Pause after automated verification before proceeding to Phase 5.

---

## Phase 5: Mutation Gate + Cookbook

### Overview

Run the narrowed Stryker mutation gate on `generation.ts`, triage each survived mutant per AGENTS.md doctrine, and fill in `test-plan.md §6` cookbook entries for the three test patterns established in Phases 2–4.

### Changes Required

#### 1. Run mutation gate and address findings

**File**: (runtime step — no code change required upfront)

**Intent**: Confirm the generation unit tests kill mutants for each distinct error-path branch. Survived mutants representing user-visible or business-relevant bugs get a new assertion in `src/test/generation.test.ts`. Equivalent mutants (cosmetic changes, unreachable branches) are consciously ignored. Do not chase 100% mutation score.

**Contract**: `npm run test:mutation` produces an HTML report in `reports/mutation/`. Triage each survived mutant: add assertion if user-visible impact; add a comment `// mutant: equivalent — <reason>` in the test file if consciously ignoring.

#### 2. Fill `test-plan.md §6` cookbook entries

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the three "TBD — see §3 Phase 1" placeholders at §6.1 (unit test for a service function), §6.2 (hermetic stub for a service with injected client), and §6.3 (React hook with mocked fetch) with prose descriptions of the patterns established here. Each entry cites the canonical example test file.

**Contract**: Replace each "TBD" placeholder paragraph with 3–5 bullet prose points: mock setup approach, oracle source (where the expected value comes from), assertion style, and the canonical example file. Do not paste code — describe the pattern so a new contributor knows what to look at.

### Success Criteria

#### Automated Verification

- `npm run test:mutation` completes without crashing (exit 0 or score above configured `low: 60` threshold)
- `npm run test` still green after any new assertions added for survived mutants
- `npm run lint` passes

#### Manual Verification

- HTML Stryker report opened; every survived mutant has a triage decision (fix or consciously ignored)
- `test-plan.md §6.1`, `§6.2`, and `§6.3` contain prose descriptions, not "TBD"

**Implementation Note**: Do not auto-accept Stryker findings without reviewing the HTML report. The triage is the point — killing every mutant mechanically produces vibe tests. Final sign-off on Phase 5 marks the Phase 1 rollout complete.

---

## Testing Strategy

### Unit Tests

- `src/test/generation.test.ts`: `it.each` over 6 failure-matrix entries + happy path + whitespace edge; oracle = Polish error messages from `generation.ts`
- `src/test/decks.test.ts`: hermetic Supabase stub; orphan-guard, empty-cards skip, ownership error, insert error; integration placeholder skipped
- `src/test/useGeneration.test.ts`: `renderHook` + `vi.spyOn(globalThis, "fetch")`; both error branches; retry success

### Manual Testing Steps

1. After Phase 1: run `npm run test` — expect "no test files found" pass, not a setup-file error
2. After Phase 2: read each test description aloud — if it names implementation internals rather than user outcomes, rewrite
3. After Phase 3: verify git log shows decks test committed before the decks.ts fix
4. After Phase 4: confirm two error branches (`!res.ok` and fetch-throws) have distinct test cases
5. After Phase 5: review HTML Stryker report before closing; note any consciously ignored mutants in the test file

## Performance Considerations

Stryker with `coverageAnalysis: "perTest"` on `generation.ts` (one file, ~50 lines of logic) runs in seconds. No performance concern for Phase 1 scope.

## References

- Research: `context/changes/testing-critical-path-coverage/research.md`
- Failure matrix oracle: `research.md §Risk#1 failure matrix`
- Generation service: `src/lib/services/generation.ts:27-73`
- Schema fix target: `src/lib/schemas/generation.ts:7-10`
- Deck service fix target: `src/lib/services/decks.ts:13-46` and `101-107`
- Hook under test: `src/components/hooks/useGeneration.ts:27-58`
- Vitest config: `vitest.config.ts`
- Stryker config: `stryker.config.json`
- Test plan rollout: `context/foundation/test-plan.md §3`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Environment & Schema Fix

#### Automated

- [x] 1.1 `npm run test` exits 0 (no setup-file error) — 2e9998b
- [x] 1.2 `npm run typecheck` passes with `.trim().min(1)` change — 2e9998b
- [x] 1.3 `npm run lint` passes — 2e9998b

#### Manual

- [x] 1.4 `vitest.setup.ts` exists at repo root — 2e9998b
- [x] 1.5 `npm run test:mutation -- --help` prints Stryker help — 2e9998b

### Phase 2: Risk #1 — Generation Unit Tests

#### Automated

- [x] 2.1 `npm run test` passes (minimum 8 generation test cases green) — 1c52a9a
- [x] 2.2 `npm run typecheck` passes — 1c52a9a
- [x] 2.3 `npm run lint` passes — 1c52a9a

#### Manual

- [x] 2.4 Each of the six Polish error messages appears in test descriptions — 1c52a9a
- [x] 2.5 No test derives its expected value from the implementation (no mirror tests) — 1c52a9a

### Phase 3: Risk #2 — Deck Atomicity (TDD)

#### Automated

- [x] 3.1 All deck tests pass (orphan-guard test green after fix)
- [x] 3.2 `npm run test` green across all suites
- [x] 3.3 `npm run typecheck` passes
- [x] 3.4 `npm run lint` passes

#### Manual

- [x] 3.5 Git log shows `src/test/decks.test.ts` committed before the `decks.ts` fix
- [x] 3.6 `cards: []` test asserts card-table stub method was not called

### Phase 4: Risk #5 — Hook Error Recovery

#### Automated

- [ ] 4.1 All hook tests pass
- [ ] 4.2 `npm run test` green across all three suites
- [ ] 4.3 `npm run typecheck` passes
- [ ] 4.4 `npm run lint` passes

#### Manual

- [ ] 4.5 Both `!res.ok` and network-reject branches have distinct test cases
- [ ] 4.6 No hook internals imported — only returned values asserted

### Phase 5: Mutation Gate + Cookbook

#### Automated

- [ ] 5.1 `npm run test:mutation` completes (exit 0 or above `low: 60` threshold)
- [ ] 5.2 `npm run test` still green after any new assertions
- [ ] 5.3 `npm run lint` passes

#### Manual

- [ ] 5.4 HTML Stryker report reviewed; every survived mutant has a triage decision
- [ ] 5.5 `test-plan.md §6.1`, `§6.2`, and `§6.3` contain prose descriptions (not "TBD")
