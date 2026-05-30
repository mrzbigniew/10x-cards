# First Gated AI Generation Implementation Plan

## Overview

Implements S-01: a signed-in user can paste source text, trigger AI generation via OpenRouter, review proposed flashcards (accept / edit inline / reject, with bulk actions), and save accepted cards to a new deck. This is the product's north-star slice — every other slice depends on it working.

## Current State Analysis

- **DB layer (F-01 done):** `decks`, `cards`, `card_sr_state` tables with RLS. `cards.source` column accepts `'ai'` or `'manual'`. `card_sr_state` is auto-populated by a DB trigger on card insert — no manual insert needed.
- **Auth layer:** Supabase SSR auth in place. `context.locals.user` available in all routes. Middleware (`src/middleware.ts:4`) protects `/dashboard` via a `PROTECTED_ROUTES` array. API routes have no auth guard yet.
- **No AI integration:** No LLM client, no API key, no generation endpoint.
- **Dashboard is a placeholder:** `src/pages/dashboard.astro` has no links to any generation flow.
- **API pattern:** `POST: APIRoute` exports, `createClient(request.headers, cookies)`, JSON bodies, Zod validation.
- **Env schema:** Declared via `envField` in `astro.config.mjs:17-22`. `OPENROUTER_API_KEY` not yet declared.

## Desired End State

A signed-in user navigates to `/generate`, pastes 50–10,000 chars of text, clicks "Generate flashcards", waits through a loading indicator, reviews proposals (accept / inline-edit / reject / bulk actions), names their new deck (auto-proposed from the first 50 chars of their text, editable), clicks "Save deck", and sees a success confirmation. Accepted cards appear in `cards` with `source = 'ai'`; `card_sr_state` rows are auto-created by the DB trigger. On AI error, an error banner appears and the pasted text is preserved. Unauthenticated users hitting `/generate` or the API endpoints are rejected (redirect or 401 respectively).

### Key Discoveries

- `src/middleware.ts:4` — `PROTECTED_ROUTES` is a simple array; extend it for `/generate` and add a separate API guard returning 401 JSON
- `src/lib/database.types.ts:107-116` — `cards.Insert` requires `front`, `back`, `source`, `deck_id`, `user_id`; `id` defaults to UUID
- `src/lib/database.types.ts:145-152` — `decks.Insert` requires `name`, `user_id`
- `astro.config.mjs:17-22` — env vars declared with `envField.string({ context: "server", access: "secret", optional: true })`
- `src/lib/supabase.ts:6-7` — `createClient` returns `null` if env vars missing; endpoints must handle null client
- `card_sr_state` is created by DB trigger on card insert — do not insert manually

## What We're NOT Doing

- Saving to an **existing** deck (that is S-02's existing-deck path for FR-009)
- **Streaming** proposals — full response, single loading state covers the wait
- **Auto-save** of the proposal draft (PRD Open Q6, accepted risk)
- **Auto-retry** with backoff on AI errors (PRD Open Q4, deferred to v2)
- Any deck or card **management UI** beyond the save-to-new-deck flow
- Manual **SR state initialization** — the DB trigger handles this entirely

## Implementation Approach

Three phases: API layer first (independently verifiable with curl), then the React frontend, then navigation wiring. The API layer is built before the UI so it can be tested in isolation before any frontend complexity is added.

OpenRouter is called via the `openai` npm package with `baseURL: https://openrouter.ai/api/v1` and model `openai/gpt-4o-mini`. The generation service sends an English system prompt instructing the model to produce flashcards in the language of the input text, returning a JSON array of `{front, back}` objects. The response is parsed with `JSON.parse` and validated with Zod before being returned to the client. On any parse or validation failure the endpoint returns a 500 with the error message.

## Critical Implementation Details

**Env schema must be declared before the import compiles.** `OPENROUTER_API_KEY` must be added to `astro.config.mjs` env schema before `import { OPENROUTER_API_KEY } from "astro:env/server"` compiles. Skipping this causes a build-time error, not a runtime one.

**API auth guard must return JSON, not redirect.** The existing middleware handles page routes with `context.redirect`. The new API guard for `/api/generate` and `/api/decks` must return `Response.json({ error: "Unauthorized" }, { status: 401 })` — the React client checks HTTP status codes, not redirect responses.

**Card bulk insert order.** Insert the deck first, capture its `id`, then bulk-insert all cards in a single `.from('cards').insert([...])` call. Do not touch `card_sr_state` — the DB trigger fires automatically on each card insert.

---

## Phase 1: API Layer

### Overview

Creates the two backend endpoints and their supporting service and schema modules. After this phase, both endpoints are testable with curl against a running dev server.

### Changes Required

#### 1. Install openai package and declare env var

**File:** `package.json` (via `npm install openai`)

**Intent:** Add the OpenAI-compatible SDK used to call OpenRouter.

**Contract:** `openai` added to `dependencies`.

---

**File:** `astro.config.mjs`

**Intent:** Declare `OPENROUTER_API_KEY` in the Astro env schema so `astro:env/server` exposes it to server-side modules.

**Contract:** Add inside the existing `env.schema` object:
```
OPENROUTER_API_KEY: envField.string({ context: "server", access: "secret", optional: true })
```

#### 2. Zod schemas for the generation API

**File:** `src/lib/schemas/generation.ts` (new)

**Intent:** Centralise request and response validation for both endpoints so the endpoints and unit tests share a single source of truth.

**Contract:**
- `GenerateRequestSchema` — `z.object({ text: z.string().min(50).max(10000) })`
- `ProposalSchema` — `z.object({ front: z.string().min(1), back: z.string().min(1) })`
- `GenerateResponseSchema` — `z.object({ proposals: z.array(ProposalSchema) })`
- `SaveDeckRequestSchema` — `z.object({ name: z.string().min(1).max(200), cards: z.array(ProposalSchema).min(1) })`
- Export TypeScript types inferred from each schema (`z.infer<typeof ...>`).

#### 3. Generation service

**File:** `src/lib/services/generation.ts` (new)

**Intent:** Isolate all OpenRouter interaction — client construction, prompt assembly, HTTP call, and response parsing — so the endpoint stays thin and the parsing logic is unit-testable without an HTTP server.

**Contract:** Export `generateProposals(text: string): Promise<Array<{ front: string; back: string }>>`. Throws a typed `GenerationError` (with a `message: string`) on: missing API key, non-2xx response from OpenRouter, malformed JSON body, or Zod validation failure of the parsed array.

The system prompt (a hardcoded string constant in this file) instructs the model in English to act as a flashcard expert, produce 5–15 question-answer pairs covering the most important facts, match the output language to the input text language, and respond with only a JSON array of `{"front": "...", "back": "..."}` objects — no prose, no markdown fences.

Model constant: `openai/gpt-4o-mini` (a named string constant at the top of the file, easy to swap). The `openai` SDK client is constructed once per call with `apiKey: OPENROUTER_API_KEY` and `baseURL: "https://openrouter.ai/api/v1"`.

#### 4. Generation endpoint

**File:** `src/pages/api/generate.ts` (new)

**Intent:** POST endpoint that validates input, checks auth, delegates to the generation service, and returns proposals.

**Contract:**
- `export const prerender = false`
- `export const POST: APIRoute` — parses JSON body, validates with `GenerateRequestSchema` (400 on failure), returns 401 if `!context.locals.user`, calls `generateProposals`, returns 200 with `{ proposals }` on success or 500 with `{ error }` on `GenerationError`.

#### 5. Deck-save service

**File:** `src/lib/services/decks.ts` (new)

**Intent:** Encapsulate the two-step DB write (create deck → bulk-insert cards) so the endpoint stays thin and the logic is testable with a mocked Supabase client.

**Contract:** Export `createDeckWithCards(supabase, userId: string, name: string, cards: Array<{ front: string; back: string }>): Promise<{ deckId: string }>`. Inserts the deck first and captures its `id`, then inserts all cards with `source: 'ai'`, `deck_id`, `user_id`. Throws on any Supabase error.

#### 6. Deck-save endpoint

**File:** `src/pages/api/decks.ts` (new)

**Intent:** POST endpoint that validates input, checks auth, calls the deck-save service, and returns the new deck ID.

**Contract:**
- `export const prerender = false`
- `export const POST: APIRoute` — parses JSON body, validates with `SaveDeckRequestSchema` (400 on failure), returns 401 if no user or null Supabase client, calls `createDeckWithCards`, returns 200 with `{ deckId }`.

#### 7. Middleware extension

**File:** `src/middleware.ts`

**Intent:** Add `/generate` to page-level route protection (existing redirect behaviour) and add a separate auth guard for the two new API endpoints (401 JSON response).

**Contract:** Add `"/generate"` to the existing `PROTECTED_ROUTES` array. Add a second guard block before `return next()`: if the pathname starts with `/api/generate` or `/api/decks` and `!context.locals.user`, return `Response.json({ error: "Unauthorized" }, { status: 401 })`.

### Success Criteria

#### Automated Verification

- `npm run lint` passes with no errors
- `npm run build` compiles without TypeScript errors

#### Manual Verification

- `curl -X POST /api/generate -H "Content-Type: application/json" -d '{"text":"x"}' -b "<auth>"` returns 400 with validation error
- Same call with 50+ char text and valid auth cookie returns 200 with `proposals` array
- Same call without auth cookie returns 401
- `curl -X POST /api/decks` without auth returns 401
- Valid deck save creates a row in `decks` and corresponding rows in `cards` (verifiable in Supabase dashboard)

**Pause for manual confirmation before proceeding to Phase 2.**

---

## Phase 2: Frontend — /generate Page and React Component Tree

### Overview

Creates the `/generate` Astro page and the full React island: paste form → loading state → proposal review list → save flow. All state lives in a single `useGeneration` hook; components are presentation-only.

### Changes Required

#### 1. Generation state machine hook

**File:** `src/components/hooks/useGeneration.ts` (new)

**Intent:** Centralise all state transitions for the generation flow so components stay simple and the state machine is testable independently.

**Contract:** Returns an object with:
- `phase: 'input' | 'generating' | 'reviewing' | 'saving' | 'done'`
- `text: string`, `setText: (v: string) => void`
- `proposals: Proposal[]` where `Proposal = { id: string; front: string; back: string; status: 'pending' | 'accepted' | 'rejected' | 'editing'; editedFront?: string; editedBack?: string }`
- `errorMessage: string | null`
- `generate(): void` — POSTs `{ text }` to `/api/generate`; transitions `input → generating → reviewing` on success; `generating → input` on error (sets `errorMessage`)
- `updateProposal(id: string, patch: Partial<Proposal>): void`
- `bulkAccept(): void` — sets all `pending` proposals to `accepted`
- `bulkReject(): void` — sets all `pending` proposals to `rejected`
- `saveProposals(deckName: string): Promise<void>` — filters to accepted proposals, POSTs `{ name, cards }` to `/api/decks`; transitions `reviewing → saving → done`

#### 2. Astro page

**File:** `src/pages/generate.astro` (new)

**Intent:** Server-rendered shell for the generation flow. Provides the Layout wrapper and mounts the React island.

**Contract:** Imports `Layout` and `GenerationFlow`. Passes `client:load` to `GenerationFlow`. Accesses `Astro.locals.user` (middleware guarantees the user is signed in). No server-side data fetching needed.

#### 3. Top-level generation component

**File:** `src/components/generation/GenerationFlow.tsx` (new)

**Intent:** Composes the hook with child components and renders the correct sub-view for each phase.

**Contract:** Uses `useGeneration`. Renders:
- `phase === 'input' || 'generating'`: `<TextInputForm />`
- `phase === 'reviewing' || 'saving'`: `<ProposalList />` above `<SaveDeckForm />`
- `phase === 'done'`: a plain "Cards saved!" success message

#### 4. Text input form

**File:** `src/components/generation/TextInputForm.tsx` (new)

**Intent:** Paste textarea, character count, submit button, loading indicator, and error banner.

**Contract:**
- Textarea bound to `text` / `setText`; `maxLength={10000}`
- Character count display: `{text.length} / 10 000`
- Submit button disabled with spinner when `phase === 'generating'`
- Submit button disabled with inline message `"Minimum 50 characters"` when `text.trim().length < 50`
- Red error banner above the textarea when `errorMessage` is set; clearing begins on the next keystroke (set `errorMessage` to null in `setText`)
- On submit: calls `generate()`

#### 5. Proposal list

**File:** `src/components/generation/ProposalList.tsx` (new)

**Intent:** Renders the full list of proposals with bulk-action controls.

**Contract:**
- Pending count badge: `{pendingCount} undecided`
- "Bulk accept remaining" button — calls `bulkAccept()`; disabled when no pending proposals
- "Bulk reject remaining" button — calls `bulkReject()`; disabled when no pending proposals
- Maps `proposals` to `<ProposalRow />` components

#### 6. Proposal row

**File:** `src/components/generation/ProposalRow.tsx` (new)

**Intent:** Single proposal with its three actions and inline edit mode.

**Contract:**
- Default view: displays `front` and `back` text; Accept, Edit, Reject buttons; green tint for `accepted`; strikethrough + muted for `rejected`
- Edit mode (triggered by Edit button): replaces text with textareas pre-filled with `editedFront ?? front` and `editedBack ?? back`; Confirm button calls `updateProposal(id, { status: 'accepted', editedFront, editedBack })`; Cancel reverts to previous status

#### 7. Save deck form

**File:** `src/components/generation/SaveDeckForm.tsx` (new)

**Intent:** Deck name input, accepted-card count, undecided-skip warning, and save button.

**Contract:**
- Deck name input pre-filled with `text.trim().replace(/\s+/g, ' ').slice(0, 50)` (derived from the hook's `text`)
- `{acceptedCount} cards will be saved` display
- If any proposals are still `pending` when the user clicks Save: show an inline warning `"{n} proposal(s) will be skipped"` and require a second click to confirm before calling `saveProposals(deckName)`
- Save button disabled while `phase === 'saving'`

### Success Criteria

#### Automated Verification

- `npm run lint` passes
- `npm run build` succeeds

#### Manual Verification

- `/generate` loads for an authenticated user; redirects unauthenticated to `/auth/signin`
- Submitting text < 50 chars shows inline message; does not call the API
- Textarea `maxLength` prevents input beyond 10,000 chars
- Submitting valid text shows loading spinner; proposals appear after the API responds
- Accept, Edit (inline textarea toggle), and Reject each update the row's visual state
- Confirming an edit marks the proposal accepted with the edited text; cancel reverts
- Bulk accept and bulk reject operate only on pending proposals
- Saving with undecided proposals shows the skip warning; second click proceeds
- After a successful save, `decks` and `cards` rows appear in Supabase; all cards have `source = 'ai'`
- Triggering an AI error (temporarily use an invalid API key) shows the error banner and leaves pasted text intact

**Pause for manual confirmation before proceeding to Phase 3.**

---

## Phase 3: Navigation, Secrets Wiring, and E2E Verification

### Overview

Wires `/generate` into the app navigation, documents secrets setup for local dev and production, and does a full end-to-end manual walkthrough.

### Changes Required

#### 1. Topbar navigation link

**File:** `src/components/Topbar.astro`

**Intent:** Add a "Generate" link in the signed-in nav so users can reach the generation page from anywhere.

**Contract:** Add `<a href="/generate">Generate</a>` alongside the existing Dashboard link, using the same Tailwind classes (`text-purple-300 transition-colors hover:text-purple-100 hover:underline`).

#### 2. Dashboard CTA

**File:** `src/pages/dashboard.astro`

**Intent:** Give new users a clear starting point from the dashboard.

**Contract:** Add a styled link or button pointing to `/generate` in the main content area.

#### 3. Local dev secrets template

**File:** `.dev.vars` (new — must be gitignored)

**Intent:** Template so any developer can wire the API key for local dev without reading Cloudflare Workers docs.

**Contract:** File contains `OPENROUTER_API_KEY=` as a placeholder. Verify `.gitignore` already lists `.dev.vars` (Cloudflare Workers convention; add the line if missing). For production: `wrangler secret put OPENROUTER_API_KEY`.

### Success Criteria

#### Automated Verification

- `npm run lint` passes
- `npm run build` succeeds

#### Manual Verification

- Topbar "Generate" link visible and functional for signed-in users
- Dashboard CTA navigates to `/generate`
- Full happy path: paste text → generate → accept some / inline-edit one / reject some → name deck → save → success message
- After save, deck and accepted cards visible in Supabase table viewer with `source = 'ai'`
- Unauthenticated user visiting `/generate` is redirected to `/auth/signin`

---

## Testing Strategy

### Unit Tests

- `src/lib/schemas/generation.ts` — boundary values for all four schemas: 49 chars (fail), 50 chars (pass), 10,000 chars (pass), 10,001 chars (fail); empty cards array; missing required fields
- `src/lib/services/generation.ts` parsing path — valid JSON array, malformed JSON, wrong schema shape (missing `back`), empty array

### Manual Testing Steps

1. Add `OPENROUTER_API_KEY=<key>` to `.dev.vars`; start `npm run dev`
2. Sign in and navigate to `/generate`
3. Paste a 200-word Polish text excerpt; click Generate; verify loading state
4. Verify proposals appear in Polish
5. Accept 2 proposals, edit 1 inline (change the answer text), reject 1, leave 1 pending
6. Click "Save deck"; verify skip warning for the 1 undecided; confirm
7. Open Supabase Table Editor: verify `decks` row and `cards` rows with `source = 'ai'`
8. Temporarily set `OPENROUTER_API_KEY=bad`; retry generation; verify error banner and text preserved
9. Sign out; navigate to `/generate`; verify redirect to `/auth/signin`

## References

- Roadmap S-01: `context/foundation/roadmap.md`
- DB schema: `supabase/migrations/20260526220447_initial_schema.sql`
- DB types: `src/lib/database.types.ts`
- Middleware: `src/middleware.ts`
- Auth API pattern: `src/pages/api/auth/signin.ts`
- Astro env config: `astro.config.mjs`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: API Layer

#### Automated

- [x] 1.1 `npm run lint` passes
- [x] 1.2 `npm run build` compiles without TypeScript errors

#### Manual

- [ ] 1.3 `POST /api/generate` returns 400 on too-short text
- [ ] 1.4 `POST /api/generate` returns 200 with proposals for valid authenticated request
- [ ] 1.5 `POST /api/generate` returns 401 without auth cookie
- [ ] 1.6 `POST /api/decks` returns 401 without auth
- [ ] 1.7 Valid deck save creates rows in `decks` and `cards` tables

### Phase 2: Frontend — /generate Page and React Component Tree

#### Automated

- [ ] 2.1 `npm run lint` passes
- [ ] 2.2 `npm run build` succeeds

#### Manual

- [ ] 2.3 `/generate` loads for authenticated user; redirects unauthenticated to signin
- [ ] 2.4 Text < 50 chars blocked with inline message
- [ ] 2.5 Loading spinner visible during generation
- [ ] 2.6 Proposals appear with accept / edit / reject per row
- [ ] 2.7 Inline textarea edit works; confirm marks accepted with edited text
- [ ] 2.8 Bulk accept and bulk reject work on pending proposals
- [ ] 2.9 Save with undecided proposals shows skip warning; second click proceeds
- [ ] 2.10 Successful save creates DB rows with `source = 'ai'`
- [ ] 2.11 AI error shows banner with text preserved

### Phase 3: Navigation, Secrets Wiring, and E2E Verification

#### Automated

- [ ] 3.1 `npm run lint` passes
- [ ] 3.2 `npm run build` succeeds

#### Manual

- [ ] 3.3 Topbar "Generate" link visible and functional
- [ ] 3.4 Dashboard CTA navigates to `/generate`
- [ ] 3.5 Full happy-path E2E walkthrough passes
- [ ] 3.6 Unauthenticated `/generate` visit redirects to signin
