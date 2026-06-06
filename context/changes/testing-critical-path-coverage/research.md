---
date: 2026-06-06T20:59:00+02:00
researcher: 10x-research
git_commit: 8b5e5bda91dbcf5efcc8e27c30534c73db667272
branch: main
repository: 10xDEVv3
topic: "Phase 1 critical-path coverage — generation output validity, save-to-deck atomicity, generation error recovery"
tags: [research, codebase, testing, generation, decks, useGeneration, vitest, msw]
status: complete
last_updated: 2026-06-06
last_updated_by: 10x-research
---

# Research: Phase 1 Critical-Path Coverage

**Date**: 2026-06-06T20:59:00+02:00
**Researcher**: 10x-research
**Git Commit**: 8b5e5bda91dbcf5efcc8e27c30534c73db667272
**Branch**: main
**Repository**: 10xDEVv3

## Research Question

Implement Phase 1 critical-path coverage from `context/foundation/test-plan.md` §3:
bootstrap Vitest and prove (a) the AI generation service produces valid output
or fails cleanly, (b) save-to-deck is atomic, (c) the generation flow preserves
pasted text on error. Phase 1 covers **Risk #1** (malformed/empty proposals),
**Risk #2** (partial deck save), and **Risk #5** (dropped input on API error).
The oracle — what each test must prove — must come from the PRD / domain
contract, not from copying the implementation's output.

## Summary

- **No test infrastructure exists.** Zero test deps, configs, or files. Phase 1
  must install and wire Vitest + MSW from scratch. The repo is **Astro 6**
  (`astro@^6.3.1`), npm, output `server`, Cloudflare adapter, React 19, Vite 7.
- **Risk #1 — well structured, testable as a unit.** `generateProposals()` in
  `src/lib/services/generation.ts` is a clean seam: it calls OpenRouter (OpenAI
  SDK), `JSON.parse`es the content, validates with `z.array(ProposalSchema)`,
  and has an explicit empty-array guard. Every failure mode throws a
  `GenerationError` with a distinct Polish message. **Cheapest layer: unit test
  with the LLM response mocked** (MSW at `openrouter.ai`, or `vi.mock("openai")`).
- **Risk #2 — the real defect is an orphaned deck, not a silent success.**
  `createDeckWithCards()` in `src/lib/services/decks.ts` does **two separate,
  non-atomic Supabase inserts** (deck, then cards) with **no transaction and no
  rollback**. If the card insert fails, the deck row already exists and the user
  gets a 500. The test-plan's framing ("user gets success but deck is empty") is
  inaccurate — there is no silent 200; there is an orphan deck. **The partial-
  failure branch is application logic → hermetic stub test.** Happy-path row
  counts + the `after_card_insert` SR-state trigger → optional integration test.
- **Risk #5 — current code already satisfies the contract.** `useGeneration`'s
  `generate()` catch branch sets `errorMessage` and returns `phase` to `"input"`
  and **never touches `text`**. A unit test (hook + mocked `fetch`) should pin
  this so a future refactor can't regress it. The only thing that clears text is
  `reset()`, called on explicit modal close — not on error.
- **Oracle tension to resolve before writing the Risk #2 test** (see Open
  Questions): the test-plan oracle says "no partial deck is created"; the code
  leaves an orphan deck. The test must either assert the *desired* contract (red
  until a compensating delete / RPC is added) or document current behaviour.
  This is a decision for `/10x-plan`, not something to guess.

## Detailed Findings

### Risk #1 — AI generation output validity (`src/lib/services/generation.ts`)

Full path: `useGeneration.generate()` → `POST /api/generate` → `generateProposals(text)` → OpenRouter.

- API route `src/pages/api/generate.ts:8-33`: auth check (401), Zod request
  validation (`GenerateRequestSchema`, 400), calls `generateProposals`, returns
  `200 { proposals }`; on `GenerationError` returns `500 { error: err.message }`,
  otherwise `500 { error: "Unexpected error" }`.
- Service `src/lib/services/generation.ts:27`:
  `generateProposals(text: string): Promise<{ front: string; back: string }[]>`.
  - Model `openai/gpt-4o-mini`, OpenAI SDK with `baseURL: "https://openrouter.ai/api/v1"` (`generation.ts:34-37`).
  - No `temperature` / `max_tokens` / `response_format` set.
  - Content: `response.choices[0]?.message?.content ?? ""` (`generation.ts:48`).
  - Parse: `JSON.parse(content)` in try/catch (`generation.ts:54-59`).
  - Validate: `z.array(ProposalSchema).safeParse(parsed)` (`generation.ts:61-64`).
  - Empty guard: explicit `length === 0` check (`generation.ts:66-69`).
- `GenerationError` (`generation.ts:20-25`): `Error` subclass, `name = "GenerationError"`, Polish `message`. No `code`/`status`.
- Proposal schema `src/lib/schemas/generation.ts:7-10`:
  `{ front: z.string().min(1), back: z.string().min(1) }`. **`.min(1)` not
  `.trim().min(1)`** → whitespace-only `" "` passes. **No max length.** Extra
  keys stripped (non-strict object). `GenerateResponseSchema` exists but is
  **not** applied to API output.

**Failure matrix (oracle for the unit test):**

| Scenario | Service behaviour | Polish message |
| --- | --- | --- |
| Invalid / non-JSON / empty content | throws `GenerationError` | `"AI zwróciło nieprawidłową odpowiedź. Spróbuj ponownie."` |
| Parses but fails schema (wrong shape, empty strings, non-array) | throws `GenerationError` | `"AI zwróciło nieoczekiwany format odpowiedzi. Spróbuj ponownie."` |
| Valid array but empty (`[]`) | throws `GenerationError` | `"AI nie zwróciło żadnych propozycji. Spróbuj z dłuższym lub bardziej szczegółowym tekstem."` |
| Network / SDK failure | throws `GenerationError` | `` `Żądanie do AI nie powiodło się: ${message}` `` |
| Missing `OPENROUTER_API_KEY` | throws `GenerationError` | `"Generowanie AI nie jest skonfigurowane. Skontaktuj się z administratorem."` |
| Happy path | returns `Proposal[]`, `length >= 1`, each `{front, back}` non-empty | — |

**Anti-pattern to avoid (test-plan §2 #1):** asserting against a hardcoded LLM
response snapshot. Assert the *contract* — array shape and the distinct error
messages keyed to each malformed input — not a captured payload.

### Risk #2 — save-to-deck atomicity (`src/lib/services/decks.ts`)

Full path: `SaveDeckForm` → `useGeneration.saveProposals` → `POST /api/decks` → `createDeckWithCards | appendCardsToDeck`.

- API route `src/pages/api/decks.ts`: `POST`; auth 401; `503` if Supabase client
  is `null`; `SaveDeckRequestSchema` (union of new-deck/existing-deck) 400 on
  Zod failure; on success `200 { deckId }`; on service throw `500 { error }`
  (`decks.ts:49-65`).
- Request schema `src/lib/schemas/generation.ts:16-26`:
  `NewDeckSaveSchema { name: string.min(1).max(200), cards: ProposalSchema[] }`
  and `ExistingDeckSaveSchema { deckId: z.uuid(), cards: ProposalSchema[] }`.
  **`cards` has no `.min(1)`** → API accepts `cards: []` (UI blocks it).
- **`createDeckWithCards` (`src/lib/services/decks.ts:13-46`) — NON-ATOMIC:**
  1. `INSERT INTO decks ... .select("id").single()` — committed independently.
  2. If `cards.length > 0`: bulk `INSERT INTO cards` (second independent call).
  3. On card error: `throw new Error(cardsError.message)` — **no rollback, no
     `deleteDeck`**. `deleteDeck` exists but is never called here.
- `appendCardsToDeck` (`decks.ts:109-141`): ownership `SELECT` (throws
  `"Deck not found or access denied"`), then single bulk card insert.
- No `.rpc(...)` anywhere in `src/`; no atomic-save Postgres function in
  `supabase/migrations/`.
- DB `supabase/migrations/20260526220447_initial_schema.sql`:
  - `cards.deck_id → decks(id) ON DELETE CASCADE`; RLS owner policies on both tables.
  - Trigger `after_card_insert` → `create_card_sr_state()` inserts one
    `card_sr_state` row per card (`migration:89-105`). If it fails, that card's
    `INSERT` statement rolls back (Postgres per-statement atomicity).
  - **No card-count column/trigger; no generation-stats trigger.** Counts come
    from `cards(count)` in `listDecksWithCardCount`.
- Bulk insert is **one statement** → all-or-nothing per statement; a true
  *partial* row landing within one insert is not the failure mode. The code does
  not check returned row count, only `error`.

**Reality vs test-plan framing:**

| Test-plan claim (Risk #2) | Actual behaviour |
| --- | --- |
| "bulk card insert fails **silently**" | Not silent — service throws, API 500, UI shows error |
| "user gets **success**, deck empty" | User gets **error**; an **orphan empty deck** may persist in DB |
| "partial bulk insert" | Not within one statement; the real gap is **deck-then-cards non-atomicity** |

**Layer choice (per CLAUDE.md two-layer doctrine):**

- **Hermetic (stub Supabase client matching `SupabaseClientType`):** deck insert
  succeeds, card insert returns `{ error }` → assert the service throws and
  **no delete/rollback is attempted**; assert `POST /api/decks` returns `500`
  and never `{ deckId }` on that path; assert card insert is skipped when
  `cards.length === 0`. This is the partial-failure branch the lesson says to
  cover hermetically.
- **Integration (real test DB), optional:** happy path of N accepted cards →
  `COUNT(cards) = N` **and** `COUNT(card_sr_state) = N` (proves the trigger);
  FK rejection of bad `deck_id`. Do **not** try to force a mid-sequence card
  failure via integration — that's what the hermetic stub is for.

**Anti-pattern to avoid (test-plan §2 #2):** mocking the DB so heavily the test
can't catch a trigger/RLS issue — hence the integration happy-path slice for the
trigger side-effect.

### Risk #5 — generation error recovery (`src/components/hooks/useGeneration.ts`)

- State: `phase` (`"input" | "generating" | "reviewing" | "saving" | "done"`),
  `text`, `proposals`, `errorMessage` (`useGeneration.ts:16-20`).
- `generate()` (`useGeneration.ts:27-58`): sets `phase="generating"`, clears
  error, POSTs `{ text }` to `/api/generate` (no `AbortController`/timeout). On
  success maps proposals and `phase="reviewing"`. **`text` is never modified**
  in the success path.
- **Catch branch (`useGeneration.ts:54-57`) — the oracle evidence:**

```54:57:src/components/hooks/useGeneration.ts
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generowanie nie powiodło się. Spróbuj ponownie.";
      setErrorMessage(message);
      setPhase("input");
```

  → `text` preserved, `phase` back to `"input"`, `errorMessage` set. Covers
  network reject, non-2xx (`!res.ok` throw), and `res.json()` failure.
- Only `reset()` (`useGeneration.ts:108-113`) clears `text`; it is called from
  `GenerationModal` on user close/done (`GenerationModal.tsx:28-57`), **not** from
  the error branch.
- Mount points are all modal-based (`dashboard.astro`, `DeckList.tsx:196`,
  `DeckDetail.tsx:53`); `GenerationModal` owns the hook and stays mounted when
  closed (`GenerationModal.tsx:73` early-returns *after* the hook runs). The
  textarea is controlled (`value={text}`), so a re-render can't wipe it.
- `src/pages/generate.astro` is a 301 redirect to `/dashboard`;
  `GenerationFlowPage.tsx` is unused dead code.

**Verdict:** code satisfies PRD US-01 AC / FR-007 today. The unit test (hook +
mocked `fetch` error) pins `text` preserved, `phase==="input"`, `errorMessage`
truthy, and that a second `generate()` is possible without re-paste.

**Anti-pattern to avoid (test-plan §2 #5):** testing only the happy path. The
whole point is the error branch; challenge "text is in state, it can't disappear."

### Test infrastructure bootstrap (Phase 1 environment)

- **No test infra at all:** no `vitest`/`@vitest/*`, `msw`, `@testing-library/*`,
  `jsdom`/`happy-dom`; no `vitest.config.*`, `vitest.setup.*`, `test/`,
  `__tests__/`, or `*.test.*`/`*.spec.*` files. `package.json` has no `test`
  script.
- Package manager: **npm** (`package-lock.json`).
- Stack: `astro@^6.3.1` (Astro **6**, not 5), `output: "server"`,
  `adapter: cloudflare()`, React 19, `@tailwindcss/vite`. `package.json`
  overrides Vite to `^7.3.2` → pick a Vitest version compatible with Vite 7.
- `tsconfig.json`: extends `astro/tsconfigs/strict`; alias `@/* → ./src/*`;
  `jsx: "react-jsx"`, `jsxImportSource: "react"`. Vitest must mirror the alias
  (`resolve.alias` or `vite-tsconfig-paths`).
- **`astro:env/server` virtual module** is imported by `src/lib/supabase.ts`,
  `src/lib/config-status.ts`, and `src/lib/services/generation.ts`
  (`SUPABASE_URL`, `SUPABASE_KEY`, `OPENROUTER_API_KEY`, all server secrets,
  optional). It will not resolve under plain Vitest — alias it to a stub module
  or `vi.mock("astro:env/server", ...)` in setup.
- Supabase client `src/lib/supabase.ts`: `createClient(headers, cookies)` returns
  a `createServerClient<Database>` or `null` when env is missing. Services type
  their first arg as `SupabaseClientType = NonNullable<ReturnType<typeof createClient>>`
  → **inject a stub client for hermetic service tests; no real Supabase needed.**
- `zod` is used but only present transitively — add it as an explicit dep when bootstrapping.
- MSW target for Risk #1: `POST https://openrouter.ai/api/v1/chat/completions`.
- CI `.github/workflows/ci.yml` runs `npm ci` → `astro sync` → `npm run lint` →
  `npm run build`. **No `astro check`, no tests.** `@astrojs/check` is installed
  but never invoked. Husky pre-commit runs lint-staged (ESLint). Wiring tests +
  `astro check` into CI is test-plan §3 Phase 4, not Phase 1.

## Code References

- `src/pages/api/generate.ts:8-33` — generation API route (auth, Zod, error mapping).
- `src/lib/services/generation.ts:20-69` — `GenerationError`, OpenRouter call, parse, validate, empty guard.
- `src/lib/schemas/generation.ts:3-26` — `GenerateRequestSchema`, `ProposalSchema`, save schemas.
- `src/pages/api/decks.ts:49-65` — save route branching + 500 mapping.
- `src/lib/services/decks.ts:13-46` — `createDeckWithCards` (non-atomic deck+cards).
- `src/lib/services/decks.ts:109-141` — `appendCardsToDeck`.
- `supabase/migrations/20260526220447_initial_schema.sql:11-105` — decks/cards tables, RLS, `after_card_insert` trigger.
- `src/components/hooks/useGeneration.ts:16-113` — state, `generate()`, error catch, `saveProposals`, `reset`.
- `src/components/generation/GenerationModal.tsx:28-73` — where `reset()` is (and isn't) called; modal stays mounted on close.
- `src/lib/supabase.ts:6-25` — client factory and `null` behaviour.
- `astro.config.mjs:9-29` — output/adapter/env schema.
- `tsconfig.json:5-12` — `@/*` alias and JSX settings.
- `.github/workflows/ci.yml:18-24` — current gates (lint + build only).

## Architecture Insights

- **Service layer is dependency-injected** (`SupabaseClientType` passed in), which
  makes hermetic stub tests trivial and is the intended seam for Risk #2/#4 tests.
- **The generation service isolates all parse/validate logic** behind one async
  function with a single error type — an ideal unit-test target; the API route is
  thin wiring on top.
- **Two distinct `Proposal` types**: the Zod/service contract `{front, back}`
  (`src/lib/schemas/generation.ts`) vs the richer UI hook type with `id`/`status`
  (`useGeneration.ts`). Service tests use the schema/service contract.
- **Atomicity is enforced only inside a single SQL statement**, never across the
  deck+cards pair — the architectural root of Risk #2.
- **Error messaging is centralised and Polish-only** (consistent with
  `lessons.md` "all user-facing text in Polish"); error-message assertions are
  stable oracles, not brittle snapshots.

## Historical Context (from prior changes)

- `context/archive/2026-05-30-first-gated-generation/plan.md` — origin of the
  bulk-insert + trigger dependency cited by test-plan Risk #2; Phase 1.2 there
  defined the generation contract now living in `generateProposals`. Its
  verification was manual curl checks (400/401/200), never automated.
- `context/archive/2026-…-review-session/plan.md` — ts-fsrs integration and the
  `due_before` contract; relevant to Phase 2 (Risk #3), not Phase 1.
- `context/foundation/test-plan.md` §2–§3 — the risk map and phased rollout this
  research grounds; §6 cookbook slots are TBD until Phase 1 ships.

## Related Research

- None yet — this is the first `research.md` under
  `context/changes/testing-critical-path-coverage/`.

## Open Questions

1. **Risk #2 oracle decision (for `/10x-plan`):** the test-plan oracle says
   "if any insert fails … no partial deck is created," but `createDeckWithCards`
   leaves an orphan deck. Should the hermetic test (a) assert the **desired**
   contract and stay red until a compensating delete or an atomic RPC is added,
   or (b) document the current orphan-deck behaviour? This is a behavioural
   decision, not a guess — surface it in the plan.
2. **Integration scope for Phase 1:** is a real Supabase test DB available in
   this session for the happy-path/trigger integration slice, or should Phase 1
   ship hermetic-only and defer the integration count assertion (mark it ad-hoc
   per test-plan §4 doctrine)?
3. **React hook test deps:** Risk #5 needs `@testing-library/react` + a DOM
   environment (`jsdom`/`happy-dom`). Confirm whether Phase 1 installs these now
   or whether the hook test runs with `renderHook` under a node-DOM shim.
4. **Empty-string / whitespace edge:** `ProposalSchema` uses `.min(1)` (not
   `.trim().min(1)`), so `" "` passes. Is a whitespace-only card a real defect to
   pin as an edge-case test, or accepted behaviour?
