<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Critical-Path Coverage

- **Plan**: context/changes/testing-critical-path-coverage/plan.md
- **Scope**: All 5 Phases
- **Date**: 2026-06-07
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical · 4 warnings · 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Automated Checks

| Check | Result |
|-------|--------|
| `npm run test` | ✅ 57/57 passed |
| `npm run lint` | ✅ 0 errors |
| `npx astro check` | ✅ 0 errors |
| `npm run test:mutation` | ✅ 64.10% (above low:60) |

## Findings

### F1 — ThemeToggle.tsx: `document` referenced at module scope

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/ThemeToggle.tsx:4–12
- **Detail**: The p1 commit refactored ThemeToggle to use useSyncExternalStore. Both `subscribeToTheme` and `getThemeSnapshot` are module-level declarations that call `document.documentElement` directly. On the server (Astro SSR / Node.js), `document` doesn't exist, so importing this module in any SSR context throws `ReferenceError: document is not defined`. The prior useEffect pattern was SSR-safe; this refactor removed that guarantee.
- **Fix A ⭐ Recommended**: Add `typeof document !== "undefined"` guards to both `getThemeSnapshot` and `subscribeToTheme`.
  - Strength: Standard useSyncExternalStore SSR pattern; protects both paths without restructuring.
  - Tradeoff: Two-line change; minimal risk.
  - Confidence: HIGH — documented idiom in React docs.
  - Blind spot: Haven't verified whether Astro's build currently imports this component on the server (client:only directive would defer the risk, not eliminate it).
- **Fix B**: Revert to useEffect pattern.
  - Strength: Definitively SSR-safe.
  - Tradeoff: Loses useSyncExternalStore tearing protection; theme flicker on mount may reappear.
  - Confidence: MEDIUM — only worthwhile if SSR imports are confirmed.
  - Blind spot: Not checked whether the flicker was visible before.
- **Decision**: PENDING

---

### F2 — vitest.setup.ts drift from plan contract

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: vitest.setup.ts
- **Detail**: Phase 1 specified "An empty TypeScript file with a single `export {}` is sufficient." The actual file registers a global `vi.mock("astro:env/server", ...)` with three env-var stubs and `afterEach(() => cleanup())`. The file was pre-created before the plan's p1 commit. The progress item was checked but the "empty" contract was not verified. The richer content is correct and necessary — but the plan was not updated to reflect it.
- **Fix**: Update Phase 1 "Changes Required" §1 wording in plan.md to reflect the actual setup file content. Documentation only; no code change.
- **Decision**: PENDING

---

### F3 — Scope creep: ThemeToggle.tsx committed inside a plan commit

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/ThemeToggle.tsx (committed in 2e9998b)
- **Detail**: The p1 commit includes ThemeToggle.tsx and vitest.config.ts alongside the three planned Phase 1 files. Neither appears in any plan phase's "Changes Required". vitest.config.ts was a necessary deviation (wires setupFiles + jsdom). ThemeToggle.tsx was an unrelated lint fix that also introduced the SSR risk in F1.
- **Fix**: Accept as historical (no git rewrite). Add a note to change.md documenting the two unplanned files: ThemeToggle (lint fix, introduced SSR risk — see F1) and vitest.config.ts (necessary Vitest wiring not mentioned in plan).
- **Decision**: PENDING

---

### F4 — generation.test.ts: per-file mock drops SUPABASE_URL/KEY

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/test/generation.test.ts:8–12
- **Detail**: `vitest.setup.ts` registers `astro:env/server` as `{ OPENROUTER_API_KEY, SUPABASE_URL, SUPABASE_KEY }`. The per-file `vi.mock` in `generation.test.ts` replaces the entire module with only `OPENROUTER_API_KEY` via a getter. `SUPABASE_URL` and `SUPABASE_KEY` are absent for any code imported in this file. Currently harmless (generation.ts only reads OPENROUTER_API_KEY), but silently breaks if the service is extended to also import Supabase env vars.
- **Fix**: Add `SUPABASE_URL: "http://localhost:54321"` and `SUPABASE_KEY: "test-supabase-key"` as static values inside the per-file mock factory to match the global mock shape.
- **Decision**: PENDING

---

### F5 — decks.ts: compensating delete failure silently lost

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/decks.ts:43–44
- **Detail**: The catch block correctly swallows the compensating delete error and re-throws the original card-insert error. However the catch is empty — when deleteDeck fails, an orphan deck persists with no log entry. The plan explicitly specifies "best-effort... swallow and re-throw" so the contract is correct, but observability is absent.
- **Fix**: Add `console.error("[createDeckWithCards] compensating delete failed:", deleteErr)` inside the catch block.
- **Decision**: PENDING

---

### F6 — generation.test.ts: happy-path asserts `length > 0` loop

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/test/generation.test.ts:99–106
- **Detail**: The happy-path test mocks `[{ front: "Pytanie 1", back: "Odpowiedź 1" }]` then asserts `result.length >= 1` and loops with `.length > 0`. The `>= 1` check can't distinguish a correct result from `[undefined]`. The loop re-validates ProposalSchema's guarantee (mirror of schema logic). An identity check with `toEqual` is the correct oracle here.
- **Fix**: Replace `length >= 1` + loop with `expect(result).toHaveLength(1)` + `expect(result[0]).toEqual({ front: "Pytanie 1", back: "Odpowiedź 1" })`.
- **Decision**: PENDING

---

### F7 — `npm run typecheck` cited in plan but script absent

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: package.json (no `typecheck` script)
- **Detail**: Every phase's automated success criteria includes `npm run typecheck`. The script does not exist. `astro check` is the correct type-checking command (verified: 0 errors). Progress items 1.2, 2.2, 3.3, 4.3 are checked [x] but could not have been mechanically run as written.
- **Fix**: Add `"typecheck": "astro check"` to `package.json` scripts.
- **Decision**: PENDING

---

### F8 — useGeneration.test.ts: `afterEach` at file scope

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/test/useGeneration.test.ts:5–7
- **Detail**: `afterEach(vi.restoreAllMocks)` is declared at file scope outside the describe block. The other two test files place cleanup inside beforeEach/describe. Functionally correct but inconsistent with the established pattern.
- **Fix**: Move the `afterEach` inside the `describe` block.
- **Decision**: PENDING

---

### F9 — decks.test.ts: stub error type narrower than PostgrestError

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/test/decks.test.ts:17–18
- **Detail**: `DbSingleResult` error shape is `{ message: string }`, narrower than Supabase's `PostgrestError` (which also has `code`, `details`, `hint`). If the service ever accesses `error.code`, the stub silently returns `undefined`.
- **Fix**: Add inline comment: `// error shape intentionally narrowed to fields the service reads; extend if service accesses .code etc.`
- **Decision**: PENDING
