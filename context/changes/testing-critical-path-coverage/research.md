---
date: 2026-06-07T09:30:00+02:00
researcher: 10x-research
git_commit: 61eb0bd83dfb7f3d29ee0b18bdb221fece8384dc
branch: main
repository: 10xDEVv3
topic: "Phase 1 critical-path coverage — generation output validity, save-to-deck atomicity, generation error recovery"
tags: [research, codebase, testing, generation, decks, useGeneration, vitest, stryker, refresh]
status: complete
last_updated: 2026-06-07
last_updated_by: 10x-research
last_updated_note: "Full refresh against commit 61eb0bd — test infra now partially bootstrapped; reconciled findings with the existing plan.md and recorded divergences."
---

# Research: Phase 1 Critical-Path Coverage

**Date**: 2026-06-07T09:30:00+02:00
**Researcher**: 10x-research
**Git Commit**: 61eb0bd83dfb7f3d29ee0b18bdb221fece8384dc
**Branch**: main
**Repository**: 10xDEVv3

> **Refresh note (2026-06-07):** This document was fully re-run against the
> current codebase (commit `61eb0bd`). The original research (2026-06-06,
> commit `8b5e5bd`) stated "no test infrastructure exists." That is **now
> partially false** — Vitest + Stryker were bootstrapped in the interim. The
> three risk findings (generation, deck-save, hook) are **behaviourally
> unchanged**, but line numbers shifted and the infra section is rewritten.
> A new section, **"What changed since the prior research,"** records the deltas
> and several **divergences from the current `plan.md`** that planning must
> reconcile before implementation continues.

## Research Question

Implement Phase 1 critical-path coverage from `context/foundation/test-plan.md` §3:
bootstrap Vitest and prove (a) the AI generation service produces valid output
or fails cleanly, (b) save-to-deck is atomic, (c) the generation flow preserves
pasted text on error. Phase 1 covers **Risk #1** (malformed/empty proposals),
**Risk #2** (partial deck save), and **Risk #5** (dropped input on API error).
The oracle — what each test must prove — must come from the PRD / domain
contract, not from copying the implementation's output.

## Summary

- **Test infrastructure is now PARTIALLY bootstrapped** (it was zero at the
  prior research). Present: `vitest@^4.1.8`, `jsdom@^29.1.1`,
  `@stryker-mutator/core` + `@stryker-mutator/vitest-runner@^9.6.1`, `zod`
  promoted to a **direct** dependency (`^4.4.3`), a `vitest.config.ts` built on
  Astro's `getViteConfig`, and a `stryker.config.json`. **Still missing:** MSW,
  `@testing-library/react`/`-dom`, `@vitest/coverage-v8`, `vitest.setup.ts`, the
  `astro:env/server` stub, the `test:watch`/`test:coverage` scripts, and **any
  test files at all**. All `plan.md` progress checkboxes remain `[ ]`.
- **Risk #1 — well structured, testable as a unit, unchanged.**
  `generateProposals()` (`src/lib/services/generation.ts`) still calls
  OpenRouter (OpenAI SDK), `JSON.parse`es the content, validates with
  `z.array(ProposalSchema)`, and has an explicit empty-array guard. Five
  distinct Polish `GenerationError` messages are the oracle (see matrix).
  **Cheapest layer: unit test with the OpenAI SDK mocked** (`vi.mock("openai")`).
- **Risk #2 — the orphan-deck defect is STILL LIVE.** The compensating-delete
  fix proposed in `plan.md` Phase 3 has **not** landed. `createDeckWithCards()`
  (`src/lib/services/decks.ts:13-46`) still does **two separate, non-atomic
  Supabase inserts**; on card-insert failure (`decks.ts:40-42`) it only
  re-throws — no `deleteDeck`, no rollback. A failed card insert leaves an
  orphan deck and the user gets a 500. No `.rpc` atomic-save exists anywhere.
  **Partial-failure branch → hermetic stub test;** happy-path row counts +
  `after_card_insert` trigger → optional/ad-hoc integration test.
- **Risk #5 — current code already satisfies the contract, unchanged.**
  `useGeneration.generate()`'s catch branch (`useGeneration.ts:54-58`) sets
  `errorMessage`, returns `phase` to `"input"`, and **never touches `text`**.
  Only `reset()` clears `text`, called on explicit modal close/done — not on
  error. A unit test (`renderHook` + mocked `fetch`) should pin this.
- **The Risk #2 oracle tension is already resolved by the plan, not the code.**
  `plan.md` decided to **fix the bug** (best-effort compensating delete) and
  assert the clean contract. The code has not yet been changed, so the Phase 3
  test is expected to be red until the fix ships. This is a known, decided item
  — not an open question anymore.

## What changed since the prior research (8b5e5bd → 61eb0bd)

The interim commits (`4e11048` bootstrap test infra, `f0e1d25` + `61eb0bd`
dependency/Vitest config, `0a9afb9` LF-lessons doc) changed the environment but
not the three risk targets. Concrete deltas:

| Area | Prior research (2026-06-06) | Current (2026-06-07) |
| --- | --- | --- |
| Vitest | "to install" | Installed: `^4.1.8` (**4.x, not the 3.x the plan assumes**) |
| Vitest config | none | `vitest.config.ts` via `getViteConfig` + `@astrojs/node` adapter |
| `astro:env/server` | "biggest infra gotcha — must alias/stub" | **No explicit stub yet**; `getViteConfig` *may* resolve the module via Astro's Vite plugins, but the secret values are still unset for tests — needs verification |
| Stryker | "to add in Phase 5, scoped to generation.ts" | Already present; `mutate` glob is **broad** (`src/**/*.ts`), not scoped |
| `zod` | transitive only | **Direct** dependency `^4.4.3` (plan item done) |
| `test` script | none | `"test": "vitest"` — **watch mode**, not `vitest run` (would hang CI) |
| Astro / Vite | `^6.3.1` / `^7.3.2` | `^6.4.4` / resolved Vite `7.3.5` |
| Risk targets | as documented | **behaviourally identical**; only line numbers shifted |

### Divergences the plan must reconcile

1. **Vitest major version.** `plan.md:69` specifies `vitest` "3.x, Vite-7
   compatible." The repo installed **4.x**. Vitest 4 changed some config/coverage
   surfaces; the plan's exact config snippet (`plan.md:77`) should be re-checked
   against Vitest 4 before relying on it.
2. **Config strategy differs from the plan.** The plan (`plan.md:71-85`)
   prescribes a hand-written `defineConfig` with `resolve.alias` plus a dedicated
   `astro:env/server` stub module (`src/test/astro-env-server.stub.ts`). The repo
   instead uses `getViteConfig` from `astro/config` (which inherits Astro's own
   Vite plugins, including env handling) with a `@astrojs/node` standalone adapter
   override. These are two different solutions to the same gotcha; the plan should
   be updated to the `getViteConfig` reality (or the team should consciously
   choose one).
3. **`test` script is watch mode.** `plan.md:69` wants `"test": "vitest run"`.
   The repo has `"test": "vitest"`. For a green non-interactive harness and any
   future CI wiring this must be `vitest run` (the watch variant belongs in
   `test:watch`).
4. **Stryker scope.** `plan.md:251-253` scopes Stryker to
   `mutate: ["src/lib/services/generation.ts"]`. The shipped config mutates
   `src/**/*.ts`. For the selective gate doctrine (CLAUDE.md / AGENTS.md), the
   Stryker run for this change should be narrowed (CLI `--mutate` or a scoped
   config) so mutation runtime stays bounded and signal stays on Risk #1.
5. **Missing deps still block Phases 2–4.** MSW, Testing Library, and
   `@vitest/coverage-v8` are not installed; `test:coverage` references a provider
   whose package is absent. Phase 1 is not actually "green harness" complete.

### Decisions (resolved 2026-06-07)

The divergences above were resolved by the team — the plan should be updated to
match these, not the original assumptions:

1. **Vitest version:** stay on **Vitest 4.x** (`^4.1.8`). Drop the plan's "3.x"
   assumption; verify the config/coverage snippet against Vitest 4 instead.
2. **Config strategy:** stay with **`getViteConfig`** from `astro/config` (the
   shipped `vitest.config.ts`). Do **not** switch to the plan's hand-written
   `defineConfig` + standalone `astro:env/server` stub module. The plan's Phase 1
   config contract should be rewritten around `getViteConfig`.
3. **Scripts:** add the **non-watch** commands. `"test"` becomes `vitest run`
   (CI-safe default), with `"test:watch": "vitest"` and `"test:coverage"` added.
4. **Stryker scope:** **scope to `generation.ts`** for this change — narrow via
   CLI `--mutate "src/lib/services/generation.ts"` or a scoped config, rather than
   the current broad `src/**/*.ts` glob, to honour the selective-gate doctrine.

Still open (see Open Questions): how secret *values* are toggled for the
missing-key test under `getViteConfig`, integration scope, and the whitespace edge.

## Detailed Findings

### Risk #1 — AI generation output validity (`src/lib/services/generation.ts`)

Full path: `useGeneration.generate()` → `POST /api/generate` → `generateProposals(text)` → OpenRouter.

- API route `src/pages/api/generate.ts:7-33`: `export const prerender = false`
  (`:5`); auth check → 401 `{ error: "Unauthorized" }` (`:8-10`); JSON parse →
  400 `{ error: "Invalid JSON body" }` (`:12-17`); `GenerateRequestSchema`
  validation → 400 with first Zod issue message or `"Invalid request"`
  (`:19-22`); success → 200 `{ proposals }` (`:24-26`); on `GenerationError` →
  500 `{ error: err.message }` (`:28-29`); otherwise 500 `{ error: "Unexpected error" }`
  (`:31`).
- Service `src/lib/services/generation.ts:27` —
  `generateProposals(text: string): Promise<{ front: string; back: string }[]>`.
  - Model `openai/gpt-4o-mini` (`generation.ts:6`); OpenAI SDK with
    `baseURL: "https://openrouter.ai/api/v1"` (`generation.ts:32-37`); client
    constructed **per call**.
  - No `temperature` / `max_tokens` / `response_format` set (`generation.ts:40-47`).
  - System prompt (`generation.ts:8-18`): flashcard expert, 5–15 cards, JSON
    array only, no markdown fences. User message is `text` passed through
    unchanged (service does no own length validation).
  - Content: `response.choices[0]?.message?.content ?? ""` (`generation.ts:48`).
  - Parse: `JSON.parse(content)` in try/catch (`generation.ts:54-59`).
  - Validate: `z.array(ProposalSchema).safeParse(parsed)` (`generation.ts:61-64`).
  - Empty guard: explicit `length === 0` check (`generation.ts:66-70`).
  - Happy return: `result.data` (`generation.ts:72`).
- `GenerationError` (`generation.ts:20-25`): `Error` subclass,
  `name = "GenerationError"`, Polish `message`. No `code`/`status`.
- Proposal schema `src/lib/schemas/generation.ts:7-10`:
  `{ front: z.string().min(1), back: z.string().min(1) }`. **`.min(1)` not
  `.trim().min(1)`** → whitespace-only `" "` passes. **No max length.** Extra
  keys stripped (non-strict object). `GenerateRequestSchema` (`:3-5`) is
  `text: z.string().min(50).max(10000)` (no `.trim()`). `GenerateResponseSchema`
  (`:12-14`) exists but is **not** applied to API output.

**Failure matrix (oracle for the unit test):**

| Scenario | Service behaviour | Polish message | Lines |
| --- | --- | --- | --- |
| Missing `OPENROUTER_API_KEY` (falsy) | throws `GenerationError` | `"Generowanie AI nie jest skonfigurowane. Skontaktuj się z administratorem."` | `28-30` |
| Network / SDK failure | throws `GenerationError` | `` `Żądanie do AI nie powiodło się: ${message}` `` (suffix = provider error, or `"Unknown error from AI provider"` when the thrown value is not an `Error`) | `49-52` |
| Invalid / non-JSON / empty content | throws `GenerationError` | `"AI zwróciło nieprawidłową odpowiedź. Spróbuj ponownie."` | `54-59` |
| Parses but fails schema (wrong shape, empty strings, non-array, `null`) | throws `GenerationError` | `"AI zwróciło nieoczekiwany format odpowiedzi. Spróbuj ponownie."` | `61-64` |
| Valid array but empty (`[]`) | throws `GenerationError` | `"AI nie zwróciło żadnych propozycji. Spróbuj z dłuższym lub bardziej szczegółowym tekstem."` | `66-70` |
| Happy path | returns `Proposal[]`, `length >= 1`, each `{front, back}` non-empty | — | `72` |

Note: `JSON.parse("null")` *succeeds*, so a literal `null` payload reaches the
Zod step and yields the **schema** message (#4), not the parse message (#3) — a
useful edge case for `it.each`.

**Anti-pattern to avoid (test-plan §2 #1):** asserting against a hardcoded LLM
response snapshot. Assert the *contract* — array shape and the distinct error
messages keyed to each malformed input — not a captured payload.

**Config-status gap:** `src/lib/config-status.ts` only checks
`SUPABASE_URL`/`SUPABASE_KEY`; `OPENROUTER_API_KEY` is **not** surfaced there.
Missing-key is detected only inside `generateProposals` → API 500 → hook error.

### Risk #2 — save-to-deck atomicity (`src/lib/services/decks.ts`)

Full path: `SaveDeckForm` → `useGeneration.saveProposals` → `POST /api/decks` → `createDeckWithCards | appendCardsToDeck`.

- API route `src/pages/api/decks.ts:27-66`: `POST`; auth 401 (`:28-30`); `503`
  `{ error: "Database not configured" }` if the Supabase client is `null`
  (`:32-35`); invalid JSON → 400 (`:37-42`); `SaveDeckRequestSchema` 400 on Zod
  failure (`:44-47`); existing-deck branch → `appendCardsToDeck` → 200
  `{ deckId }` (`:50-52`); new-deck branch → `createDeckWithCards` → 200
  `{ deckId }` (`:54-60`); on service throw → 500 `{ error }` (`:62-65`).
- Save request schemas `src/lib/schemas/generation.ts:16-26`:
  `NewDeckSaveSchema { name: string.min(1).max(200), cards: ProposalSchema[] }`
  and `ExistingDeckSaveSchema { deckId: z.uuid(), cards: ProposalSchema[] }`,
  unioned as `SaveDeckRequestSchema`. **`cards` has no `.min(1)`** → API accepts
  `cards: []` (UI blocks it).
- **`createDeckWithCards` (`src/lib/services/decks.ts:13-46`) — NON-ATOMIC, STILL UNFIXED:**
  1. `INSERT INTO decks ... .select("id").single()` (`:19-23`) — committed independently; `deckError` → throw (`:25-27`).
  2. If `cards.length > 0`: bulk `INSERT INTO cards` with `source: "ai"`, `deck_id`, `user_id` (`:29-38`).
  3. On card error (`:40-42`): `throw new Error(cardsError.message)` — **no rollback, no `deleteDeck`, no `console.warn`**.
  4. Success: `return { deckId: deck.id }` (`:45`).

```40:42:src/lib/services/decks.ts
    if (cardsError) {
      throw new Error(cardsError.message);
    }
```

- `deleteDeck` (`decks.ts:101-107`) exists (delete by id + `user_id` filter) but
  is **only** used by the DELETE route, never on the save-failure path.
- `appendCardsToDeck` (`decks.ts:109-141`): ownership `SELECT` (`:115-124`,
  throws `"Deck not found or access denied"`), `cards.length === 0` early return
  (`:126`), single bulk card insert (`:128-136`), insert error → throw (`:138-140`).
- No `.rpc(...)` anywhere in `src/` or `supabase/`; no atomic-save Postgres
  function in `supabase/migrations/`.
- DB `supabase/migrations/20260526220447_initial_schema.sql`:
  - `decks` (`:11-17`), `cards` (`:32-41`) with `cards.deck_id → decks(id) ON DELETE CASCADE`; owner RLS policies on both (`:21-25`, `:46-50`).
  - Trigger `after_card_insert` → `create_card_sr_state()` inserts one
    `card_sr_state` row per card (`:89-105`); `card_sr_state.card_id → cards(id) ON DELETE CASCADE` (`:61`).
  - `20260602000000_review_session.sql` adds `learning_steps` + `review_logs` — **no** save RPC.
- Bulk insert is **one statement** → all-or-nothing per statement; a true
  *partial* row landing within one insert is not the failure mode. The code does
  not check returned row count, only `error`.

**Reality vs test-plan framing (unchanged from prior research):**

| Test-plan claim (Risk #2) | Actual behaviour |
| --- | --- |
| "bulk card insert fails **silently**" | Not silent — service throws, API 500, UI shows error |
| "user gets **success**, deck empty" | User gets **error**; an **orphan empty deck** may persist in DB |
| "partial bulk insert" | Not within one statement; the real gap is **deck-then-cards non-atomicity** |

**Layer choice (per CLAUDE.md two-layer doctrine):**

- **Hermetic (stub Supabase client matching `SupabaseClientType`):** deck insert
  succeeds, card insert returns `{ error }` → after the **plan's fix**, assert
  the service throws the original error **and** a compensating delete on `decks`
  for the created id was issued (no orphan). Until the fix lands, this test is
  red. Also assert `cards.length === 0` skips the card insert, and
  `appendCardsToDeck` ownership/insert error paths.
- **Integration (real test DB), optional/ad-hoc:** happy path of N accepted cards
  → `COUNT(cards) = N` **and** `COUNT(card_sr_state) = N` (proves the trigger).
  Do **not** try to force a mid-sequence card failure via integration — that's
  what the hermetic stub is for. Deferred per test-plan §4 doctrine.

**Anti-pattern to avoid (test-plan §2 #2):** mocking the DB so heavily the test
can't catch a trigger/RLS issue — hence the integration happy-path slice for the
trigger side-effect.

### Risk #5 — generation error recovery (`src/components/hooks/useGeneration.ts`)

- State: `phase` (`"input" | "generating" | "reviewing" | "saving" | "done"`),
  `text`, `proposals`, `errorMessage` (`useGeneration.ts:17-20`).
- `setText` (`:22-25`) updates `text` and clears `errorMessage` on user edit.
- `generate()` (`:27-58`): sets `phase="generating"`, clears error, POSTs
  `{ text }` to `/api/generate` (**no `AbortController`/timeout**). `!res.ok` →
  throws `new Error(data.error ?? "Generowanie nie powiodło się")` (`:40-42`). On
  success maps proposals (ids + `status:"pending"`) and `phase="reviewing"`
  (`:44-53`). **`text` is never modified** in the success path.
- **Catch branch (`useGeneration.ts:54-58`) — the oracle evidence:**

```54:58:src/components/hooks/useGeneration.ts
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generowanie nie powiodło się. Spróbuj ponownie.";
      setErrorMessage(message);
      setPhase("input");
    }
```

  → `text` preserved, `phase` back to `"input"`, `errorMessage` set. Covers
  network reject, non-2xx (`!res.ok` throw), and `res.json()` failure.
- `saveProposals()` (`:73-106`) has its own catch that returns `phase` to
  `"reviewing"` on save error and **also never touches `text`**.
- Only `reset()` (`:108-113`) clears `text`; it is called from
  `GenerationModal.tsx` on close when `phase !== "reviewing"` (`:32-33`), on
  confirmed close (`:49-51`), and on `handleDone` after save (`:55-56`) — **not**
  from the error branch.
- Mount points (three, all modal-based): `GenerateButton.tsx:18-23`,
  `DeckList.tsx:196-202` (`preselectedDeckId`), `DeckDetail.tsx:53-57`. The
  dashboard wires both `GenerateButton` and `DeckList` → **two independent
  `GenerationModal` instances**, each with its own hook state.
- `GenerationModal` owns the hook (`GenerationModal.tsx:12-14`); the early
  return `if (!isOpen) return toast;` (`:73`) runs **after** the hook, so the
  modal stays mounted and state persists. `GenerationFlow` is a presenter
  receiving hook values as props (`:116`). The textarea is controlled
  (`value={text}` — `TextInputForm.tsx:27-37`), so a re-render can't wipe it.
- `src/pages/generate.astro` is a 301 redirect to `/dashboard`;
  `GenerationFlowPage.tsx` is unused dead code (not imported anywhere).

**Verdict:** code satisfies PRD US-01 AC / FR-007 today. The unit test
(`renderHook` + mocked `fetch` error) pins `text` preserved, `phase==="input"`,
`errorMessage` truthy, and that a second `generate()` succeeds without re-paste.

**Residual (non-violations, for test design):**
- No automated test pins the catch branch — regression is unguarded (the point of Risk #5).
- No fetch timeout/abort — a hung request leaves `phase==="generating"` indefinitely (text stays, UI disabled).
- User-initiated close during `"generating"` calls `reset()` and wipes `text` — that is *not* the API-error path and is out of FR-007 scope.

**Anti-pattern to avoid (test-plan §2 #5):** testing only the happy path. The
whole point is the error branch; challenge "text is in state, it can't disappear."

### Test infrastructure bootstrap (Phase 1 environment) — current state

- **Dependencies present** (`package.json`): `vitest@^4.1.8`, `jsdom@^29.1.1`,
  `@stryker-mutator/core@^9.6.1`, `@stryker-mutator/vitest-runner@^9.6.1`;
  `zod@^4.4.3` promoted to **direct** dependency; `@astrojs/node@^10.1.3`
  (used by the Vitest config). Astro `^6.4.4`, Vite resolved `7.3.5` via the
  `overrides` pin.
- **Dependencies still missing:** `msw`, `@testing-library/react`,
  `@testing-library/dom`, `@vitest/coverage-v8` (the coverage provider declared
  in config is not installed).
- **Scripts:** `"test": "vitest"` (`package.json:13`) — **watch/interactive
  mode**, not `vitest run`. No `test:watch`, no `test:coverage`, no Stryker
  script.
- **`vitest.config.ts`** (new):

```1:19:vitest.config.ts
/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config'
import node from '@astrojs/node';


export default getViteConfig({
  test: {
    environment: "jsdom",
    globals: false,
    coverage: {
      provider: "v8",
    },
    alias: {
      "@": "/src",
    }
  }
}, {
  adapter: node({ mode: 'standalone' })
})
```

  - Uses Astro's `getViteConfig`, so the config inherits Astro's Vite plugins —
    this is a **different** approach to the `astro:env/server` gotcha than the
    plan's standalone stub module, and may resolve the *module* (though secret
    *values* are still unset for tests; **verify** during Phase 1).
  - `environment: "jsdom"`, `globals: false` (tests must import from `vitest`
    explicitly — lint-clean), `@` aliased to `/src`.
  - No `setupFiles`; **no `vitest.setup.ts` and no `src/test/` exist.**
- **`stryker.config.json`** (new): `testRunner: "vitest"`,
  `coverageAnalysis: "perTest"`, `mutate: ["src/**/*.ts", "!*.spec.ts", "!*.test.ts"]`
  (**broad**, not scoped to `generation.ts`), thresholds high 80 / low 60 / break null.
- **No test files exist** anywhere (`**/*.test.*`, `**/*.spec.*`, `src/test/**`,
  `__tests__/**` → 0). The smoke test, the three risk suites, and the supabase
  stub from the plan are all unwritten.
- **CI unchanged** (`.github/workflows/ci.yml:18-24`): `npm ci` → `astro sync`
  → `npm run lint` → `npm run build`. **No tests, no `astro check`** (still
  test-plan §3 Phase 4). Husky pre-commit runs lint-staged only.
- Supabase client `src/lib/supabase.ts:3,6-25`: `createClient(headers, cookies)`
  returns a `createServerClient<Database>` or `null` when env is missing;
  services type the first arg as
  `SupabaseClientType = NonNullable<ReturnType<typeof createClient>>` → **inject a
  stub for hermetic service tests; no real Supabase needed.**
- ESLint `strictTypeChecked` over `**/*` (`eslint.config.js`): test files will be
  type-checked/linted — import Vitest globals explicitly and type stubs against
  `SupabaseClientType`.

## Code References

- `src/pages/api/generate.ts:5-33` — `prerender=false`, auth, JSON, Zod, error mapping.
- `src/lib/services/generation.ts:20-72` — `GenerationError`, OpenRouter call, parse, validate, empty guard, return.
- `src/lib/schemas/generation.ts:3-26` — `GenerateRequestSchema`, `ProposalSchema`, `GenerateResponseSchema`, save schemas.
- `src/lib/config-status.ts:11-21` — Supabase-only config status (no `OPENROUTER_API_KEY`).
- `src/pages/api/decks.ts:27-66` — save route branching + 500 mapping + 503-on-null.
- `src/lib/services/decks.ts:13-46` — `createDeckWithCards` (non-atomic deck+cards, no rollback).
- `src/lib/services/decks.ts:101-107` — `deleteDeck` (exists, unused on save-failure path).
- `src/lib/services/decks.ts:109-141` — `appendCardsToDeck`.
- `supabase/migrations/20260526220447_initial_schema.sql:11-105` — decks/cards tables, RLS, `after_card_insert` trigger.
- `src/components/hooks/useGeneration.ts:17-113` — state, `generate()`, error catch, `saveProposals`, `reset`.
- `src/components/generation/GenerationModal.tsx:12-73` — hook owner; where `reset()` is (and isn't) called; modal stays mounted on close.
- `src/components/generation/TextInputForm.tsx:21-37` — controlled textarea + error banner.
- `src/lib/supabase.ts:3-25` — client factory and `null` behaviour.
- `vitest.config.ts:1-19` — current Vitest config (`getViteConfig` + node adapter).
- `stryker.config.json:1-22` — Stryker config (broad mutate glob).
- `package.json:5-14,30-70` — scripts, deps, Vite override.
- `astro.config.mjs:13-22` — Vite plugins + env schema.
- `tsconfig.json:9-11` — `@/*` alias.
- `.github/workflows/ci.yml:18-24` — current gates (lint + build only).

## Architecture Insights

- **Service layer is dependency-injected** (`SupabaseClientType` passed in), which
  makes hermetic stub tests trivial and is the intended seam for Risk #2/#4 tests.
- **The generation service isolates all parse/validate logic** behind one async
  function with a single error type — an ideal unit-test target; the API route is
  thin wiring on top.
- **Two distinct `Proposal` types**: the Zod/service contract `{front, back}`
  (`schemas/generation.ts`) vs the richer UI hook type with `id`/`status`
  (`useGeneration.ts`). Service tests use the schema/service contract.
- **Atomicity is enforced only inside a single SQL statement**, never across the
  deck+cards pair — the architectural root of Risk #2; the fix decided in the
  plan is an application-level compensating delete, not a DB transaction/RPC.
- **Error messaging is centralised and Polish-only** (consistent with
  `lessons.md` "all user-facing text in Polish"); error-message assertions are
  stable oracles, not brittle snapshots.
- **The chosen Vitest config leans on Astro's `getViteConfig`** rather than a
  hand-rolled config — a reasonable bet that Astro's plugins resolve virtual
  modules, but it diverges from the plan and the secret-value toggling story
  still needs an explicit mechanism for the missing-key test.

## Historical Context (from prior changes)

- `context/changes/testing-critical-path-coverage/research.md` (this file, prior
  version, commit `8b5e5bd`) — stated zero test infra; superseded by this refresh.
- `context/changes/testing-critical-path-coverage/plan.md` / `plan-brief.md` —
  the full 5-phase plan and decisions; **note the divergences listed above**
  (Vitest 4 vs 3, `getViteConfig` vs stub module, `vitest run` vs watch,
  Stryker scope).
- `context/archive/2026-05-30-first-gated-generation/plan.md` — origin of the
  bulk-insert + trigger dependency cited by test-plan Risk #2; the generation
  contract now living in `generateProposals` was defined there. Verification was
  manual curl checks, never automated.
- `context/foundation/test-plan.md` §2–§3 — the risk map and phased rollout this
  research grounds; §6 cookbook slots are still TBD (Phase 1 has not shipped).

## Related Research

- Prior version of this same `research.md` (commit `8b5e5bd`) — this document is
  its refresh. No other research artifacts exist under
  `context/changes/testing-critical-path-coverage/`.

## Open Questions

1. **~~Vitest 4 vs the plan's 3.x assumption.~~ RESOLVED 2026-06-07:** stay on
   Vitest 4.x. Action moved to plan: re-verify the config snippet and
   `@vitest/coverage-v8` 4.x compatibility, and add the non-watch scripts.
2. **`astro:env/server` under `getViteConfig`.** Does the current config resolve
   the virtual module at all, and how are the secret *values* (e.g. toggling
   `OPENROUTER_API_KEY` present/absent for the Risk #1 missing-key test) supplied?
   A `vi.mock("astro:env/server", ...)` or a per-test override mechanism is still
   needed regardless of module resolution. (Technical approach — can be settled in
   plan/implement; not blocked on a product decision.)
3. **~~Integration scope for Phase 1.~~ RESOLVED 2026-06-07:** ship
   **hermetic-only**; defer the happy-path count/trigger integration assertion as
   a skipped, ad-hoc placeholder per test-plan §4. Matches the existing plan.
4. **~~Empty-string / whitespace edge.~~ RESOLVED 2026-06-07 — now IN SCOPE:**
   pin whitespace-only as an explicit edge case. This requires changing
   `ProposalSchema` from `.min(1)` to `.trim().min(1)` (a **behaviour change** —
   `" "` becomes rejected, and `.trim()` also normalises surrounding whitespace on
   valid content) plus a test asserting rejection (→ `GenerationError` message #4
   at the service layer, 400 at the save API). Expands Phase 1 scope beyond the
   original plan's "out of scope" note.

> **Resolved since the prior research:** the Risk #2 oracle decision (assert the
> desired contract vs document the bug) was **answered by `plan.md`** — fix the
> bug with a best-effort compensating delete and assert the clean contract. It is
> no longer an open question; it is a pending implementation task (Phase 3).
