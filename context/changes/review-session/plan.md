# S-03 Review Session Implementation Plan

## Overview

Implement roadmap slice **S-03 (review-session)**: a per-deck spaced-repetition review loop. The user opens a deck, starts a session for cards due today (or overdue), sees each card's question, reveals the answer, rates recall on the ts-fsrs native four-button scale (Again / Hard / Good / Easy), has each rating persisted immediately, and reaches an end-of-session summary. When nothing is due, a "0 due" screen explains the situation.

This is an **integration** task, not an algorithm decision: `ts-fsrs@^5.4.1` is already installed and `card_sr_state` is already a faithful ts-fsrs `Card` snapshot (one row per card, created by the `after_card_insert` trigger). The work is a service + API routes + UI on top of the library, plus closing one schema gap and adding review-log history.

## Current State Analysis

- **Library**: `ts-fsrs@^5.4.1` pinned in `package.json:37`, installed and importable (`node_modules/ts-fsrs/dist/index.d.ts`).
- **Schema**: `supabase/migrations/20260526220447_initial_schema.sql:56-105` defines `card_sr_state` with all FSRS fields **except `learning_steps`**, plus RLS owner policies, an `updated_at` trigger, and the `after_card_insert` → `create_card_sr_state()` trigger that auto-creates a defaults row per card.
- **Generated types**: `src/lib/database.types.ts:37-95` exposes typed `card_sr_state` Row/Insert/Update (also missing `learning_steps`).
- **Existing SR helper**: `src/lib/services/cards.ts:50-70` `resetCardSRState()` hand-rolls zeros (and omits `learning_steps`).
- **House patterns** (confirmed in `src/pages/api/decks/[id]/cards.ts`, `src/pages/api/decks/[id].ts`): API routes export `const prerender = false`, use named method exports, guard `context.locals.user`, build a per-request client via `createClient(context.request.headers, context.cookies)`, Zod `safeParse` against schemas in `src/lib/schemas/`, and delegate to services in `src/lib/services/`.
- **Frontend pattern** (confirmed in `src/pages/deck/[id].astro`, `src/components/DeckDetail.tsx`, `src/components/hooks/useDeckDetail.ts`): an `.astro` page renders a `client:load` React root inside `Layout` + `Topbar`; the React root uses a hook that `fetch`es API routes and manages loading/error state.
- **ReviewLog shape** (from `node_modules/ts-fsrs/dist/index.d.ts:18-35`): `{ rating, state, due, stability, difficulty, elapsed_days, last_elapsed_days, scheduled_days, learning_steps, review }` — `state`/`due` capture the pre-review snapshot; `review` is the timestamp of the rating.

## Desired End State

A signed-in user can:
- From the dashboard deck card or the deck-detail page, click "Review" to open `/deck/<id>/review`.
- See either a "0 due" screen, or a session that walks each due card: question → reveal answer → four rating buttons.
- Have every rating persisted to `card_sr_state` immediately, with a corresponding `review_logs` row appended.
- Have cards rated **Again** re-appear later in the same session until rated Hard/Good/Easy.
- Reach an end-of-session summary when the queue is empty.

Verify by: running a session against a deck with seeded due cards, confirming `card_sr_state` updates and `review_logs` inserts per rating, confirming Again-cards re-queue, and confirming `astro check` / lint pass.

### Key Discoveries

- `ts-fsrs` `Card.learning_steps` is **required** (`index.d.ts:33`); `CardInput extends Omit<Card,'state'|'due'|'last_review'>` so `learning_steps` is mandatory on `next()`/`repeat()` input. Without a column, `rowToFsrsCard()` is a `tsc` error and step position is lost across sessions. → **Add the column** (decision below).
- `next(card, now, grade)` returns `RecordLogItem = { card, log }` (`index.d.ts:36-40`). `card` → persist to `card_sr_state`; `log` → insert into `review_logs`.
- `Grade = Exclude<Rating, Rating.Manual>` → valid ratings are `1|2|3|4` (`research.md:132`). The API must reject `0` (Manual).
- `due` is indexed (`card_sr_state_due_idx`, migration line 77) — the due-cards query is index-friendly.
- `elapsed_days` / `last_elapsed_days` are `@deprecated` (removed in ts-fsrs 6.0.0) but required on `^5.4.1`; keep mapping them, note the future-major risk.

## What We're NOT Doing

- No interval-preview hints on rating buttons (`repeat()` not used in UI).
- No daily-load cap — load all due cards (roadmap Open Question 7: ship uncapped).
- No per-user FSRS parameter optimizer (`@open-spaced-repetition/binding`).
- No cross-deck review (per-deck only, per PRD non-goal).
- No undo/rollback of a submitted rating in the UI.
- No changes to the AI-generation or deck-CRUD flows beyond adding a Review entry point.
- No automated test harness setup (no test runner exists yet in the repo; testing strategy lands in Module 3). Success criteria below use `astro check` + lint + manual verification.

## Implementation Approach

Build bottom-up: schema → types → service → API → UI. The session is **client-driven**: the page loads all due cards once (`GET`), the `useReviewSession` hook holds an in-memory queue, and each rating is `POST`ed individually so persistence is immediate and crash-safe (FR-015). The server is stateless per request; "session" lives in the client. Re-queue of Again cards is purely client-side queue manipulation — the server just persists whatever rating arrives.

Timezone policy: **user timezone**. The client computes the end-of-local-day instant and sends it as a `due_before` ISO query param; the server validates it (Zod ISO datetime) and filters `due <= due_before`. RLS still scopes every row to the owner, so a client-supplied boundary is a low-risk read filter.

FSRS config: a single shared `fsrs()` instance with **library defaults** (fuzz on). Tests (future) that need determinism construct their own `fsrs({ enable_fuzz: false })`.

## Critical Implementation Details

- **Persist order in `applyRating`**: update `card_sr_state` first, then insert the `review_logs` row. Both are scoped by `user_id` so RLS enforces ownership; if the log insert fails, the SR state is still correct (the user-visible guarantee in FR-015) and the lost log is acceptable, non-fatal history. Surface a log-insert failure as a server error only if it must be strict — default: best-effort log, never block the rating.
- **Again re-queue lifecycle**: the hook's queue is an ordered array of due cards. Rating Again moves the (now-rescheduled) card to the tail; Hard/Good/Easy removes it. Scheduling correctness does **not** depend on the client carrying SR state: `applyRating` reloads the `card_sr_state` row fresh from the DB (scoped by `user_id`) on every call, so a second `next()` on an Again card always computes from the post-Again state already persisted. The SR fields returned by the POST are therefore for **UI display of the re-queued card only** — `applyRating` is the single source of truth for scheduling. The session ends when the queue is empty.
- **`due_before` is required**: if the client omits it (e.g. JS disabled), the server should reject with 400 rather than silently using UTC — keeps the timezone contract explicit.

## Phase 1: Schema & Types

### Overview

Close the `learning_steps` gap on `card_sr_state` and add an append-only `review_logs` table with RLS, then regenerate the typed client.

### Changes Required

#### 1. New migration: add `learning_steps`, add `review_logs`

**File**: `supabase/migrations/<timestamp>_review_session.sql` (new)

**Intent**: Make `card_sr_state` a complete ts-fsrs `Card` snapshot and add history storage for review logs.

**Contract**:
- `ALTER TABLE card_sr_state ADD COLUMN learning_steps int4 NOT NULL DEFAULT 0;` (placed alongside the other SR fields semantically; existing rows backfill to 0, which is the correct "no step" default).
- New `review_logs` table, append-only, one row per rating. Columns mirror ts-fsrs `ReviewLog` plus ownership/audit:
  `id uuid PK default gen_random_uuid()`, `card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE`, `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `rating smallint NOT NULL CHECK (rating IN (1,2,3,4))`, `state smallint NOT NULL CHECK (state IN (0,1,2,3))`, `due timestamptz NOT NULL`, `stability float4 NOT NULL`, `difficulty float4 NOT NULL`, `elapsed_days int4 NOT NULL`, `last_elapsed_days int4 NOT NULL`, `scheduled_days int4 NOT NULL`, `learning_steps int4 NOT NULL`, `review timestamptz NOT NULL`, `created_at timestamptz NOT NULL DEFAULT now()`.
- Index: `CREATE INDEX review_logs_card_id_idx ON review_logs (card_id);` and `review_logs_user_id_idx ON review_logs (user_id);`.
- RLS: `ENABLE ROW LEVEL SECURITY` + owner `SELECT` and owner `INSERT` policies (`auth.uid() = user_id`). No update/delete policies — history is immutable; cascade handles card deletion.

Follow the exact DDL/RLS style of the `card_sr_state` block in `20260526220447_initial_schema.sql:56-105`.

#### 2. Regenerate database types

**File**: `src/lib/database.types.ts`

**Intent**: Reflect the new column and table in the typed Supabase client.

**Contract**: Run `npm run gen-types` (requires the local Supabase stack). Result must include `card_sr_state.learning_steps: number` (Row/Insert/Update) and a new `review_logs` table type. Do not hand-edit; regenerate.

### Success Criteria

#### Automated Verification

- Migration applies cleanly to the local stack (`supabase db reset` or `supabase migration up`).
- `npm run gen-types` produces `learning_steps` on `card_sr_state` and a `review_logs` table in `src/lib/database.types.ts`.
- Type checking passes: `npx astro check`.
- Linting passes: `npm run lint`.

#### Manual Verification

- `review_logs` rejects an `INSERT` from a different user (RLS) and accepts the owner's.
- Existing `card_sr_state` rows show `learning_steps = 0` after migration.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: SR Service Layer

### Overview

Add `src/lib/services/sr.ts` owning the row↔`Card` mapping, the scheduler, the due-cards query, and the rating application. Refactor `resetCardSRState()` to library semantics.

### Changes Required

#### 1. SR service module

**File**: `src/lib/services/sr.ts` (new)

**Intent**: Single home for ts-fsrs integration so API routes stay thin and the mapping lives in one tested place.

**Contract**:
- A shared scheduler: `const scheduler = fsrs();` (module-level singleton, default params).
- `rowToFsrsCard(row)`: map a `card_sr_state` Row → ts-fsrs `Card`, **including `learning_steps: row.learning_steps`** and `last_review: row.last_review ? new Date(row.last_review) : undefined`. (The doc's mapper at `ts-fsrs-api-doc.md:118-131` is correct except for the missing `learning_steps` — add it.)
- `fsrsCardToDbUpdate(card)`: map `Card` → `card_sr_state` Update, including `learning_steps: card.learning_steps`, dates → ISO strings, `last_review` → ISO or `null`.
- `reviewLogToDbInsert(log, cardId, userId)`: map ts-fsrs `ReviewLog` → `review_logs` Insert (`rating`, `state`, `due`/`review` as ISO, numeric fields direct).
- `loadDueCards(supabase, userId, deckId, dueBefore)`: query **from `card_sr_state`** (which owns `user_id`, the indexed `due`, and all SR fields), filtering `.eq('user_id', userId)` + `.lte('due', dueBefore)` + `.order('due')` on the base table — this avoids the embedded-order/LEFT-join pitfalls of filtering on a nested resource. Embed the parent card via `cards!inner(id, front, back)` and filter the embed by `.eq('cards.deck_id', deckId)` so only cards from the requested deck are returned (the `!inner` modifier turns the embed into an INNER join, dropping SR rows whose card is in another deck). Returns: card `id`, `front`, `back`, plus the full SR row for display in the re-queued Again card.
- `applyRating(supabase, userId, cardId, deckId, rating, now)`: load the card's `card_sr_state` row joined to `cards` to confirm `card_id` belongs to `deck_id` and `user_id` (defense-in-depth — prevents rating a card from another of the user's own decks via a mismatched URL). `rowToFsrsCard`, `scheduler.next(card, now, rating)`, `update card_sr_state` with `fsrsCardToDbUpdate(result.card)` (scoped by `card_id` + `user_id`), then insert `reviewLogToDbInsert(result.log, ...)`. Return the updated SR fields so the client can display the re-queued card. Throw on the SR-state update error; treat the log insert as best-effort (see Critical Implementation Details).

#### 2. Refactor `resetCardSRState`

**File**: `src/lib/services/cards.ts`

**Intent**: Replace hand-rolled zeros with library-derived defaults and include `learning_steps`, eliminating drift from ts-fsrs defaults.

**Contract**: Build the reset update from `createEmptyCard(new Date())` via `fsrsCardToDbUpdate` (or `forget()` on the current card), so the persisted shape always matches the library — and now includes `learning_steps`. Keep the existing function signature and call sites in `updateCard` unchanged.

### Success Criteria

#### Automated Verification

- Type checking passes: `npx astro check` (confirms `rowToFsrsCard` returns a valid `Card` with `learning_steps`).
- Linting passes: `npm run lint`.

#### Manual Verification

- A scripted/manual `applyRating` call updates `card_sr_state` (due advances, reps increments) and appends one `review_logs` row.
- Reset path: editing a card with "reset SR" checked produces a defaults row equal to `createEmptyCard()` output (incl. `learning_steps = 0`).

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 3: API Routes

### Overview

Expose two endpoints: load due cards for a deck, and submit a rating.

### Changes Required

#### 1. Review Zod schemas

**File**: `src/lib/schemas/review.ts` (new)

**Intent**: Validate the API boundary; constrain `rating` to ts-fsrs `Grade` (exclude Manual).

**Contract**:
- `DueQuerySchema`: `{ due_before: z.string().datetime() }` (ISO instant; required).
- `SubmitRatingSchema`: `{ rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]) }` — rejects `0` (Manual) so it can never reach `next()` (`research.md:132`).

#### 2. Due-cards endpoint

**File**: `src/pages/api/decks/[id]/review.ts` (new)

**Intent**: Return the deck's due cards for the session.

**Contract**: `export const prerender = false;` + `GET`. Guard `context.locals.user`; resolve `deckId` from params; build client via `createClient(...)`. Parse `due_before` from `context.url.searchParams` with `DueQuerySchema`. Delegate to `loadDueCards(...)`. Return `{ cards: [...] }` (each item: `{ id, front, back, sr: <card_sr_state row> }`). Mirror the error/status conventions in `src/pages/api/decks/[id]/cards.ts`.

#### 3. Submit-rating endpoint

**File**: `src/pages/api/decks/[id]/review/[cardId].ts` (new)

**Intent**: Persist one rating and its log.

**Contract**: `export const prerender = false;` + `POST`. Guard auth; resolve `id` (deck) + `cardId` from params; parse JSON body with `SubmitRatingSchema`. Delegate to `applyRating(supabase, user.id, cardId, id, rating, new Date())` — passing the deck `id` for defense-in-depth validation. Return the updated SR fields (e.g. `{ sr: <updated row fields> }`) so the client can display the re-queued Again card. Follow the `[cardId].ts` route conventions already in the repo.

### Success Criteria

#### Automated Verification

- Type checking passes: `npx astro check`.
- Linting passes: `npm run lint`.

#### Manual Verification

- `GET /api/decks/<id>/review?due_before=<iso>` returns only cards with `due <= due_before` for the owner; returns `[]` when none are due; `400` when `due_before` is missing/invalid; `401` when unauthenticated.
- `POST /api/decks/<id>/review/<cardId>` with `{ "rating": 3 }` updates state and returns fresh SR fields; `{ "rating": 0 }` returns `400`.

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 4: Review-Session UI

### Overview

Add the review page, its React session component + hook (queue with Again re-queue), and entry-point CTAs.

### Changes Required

#### 1. Review page

**File**: `src/pages/deck/[id]/review.astro` (new)

**Intent**: Server-rendered shell that mounts the session React root, mirroring `src/pages/deck/[id].astro`.

**Contract**: Read `Astro.params.id` (404 if missing). Render `Layout` + `Topbar` and `<ReviewSession deckId={id} client:load />` inside the same centered container used by the deck page.

#### 2. Session hook

**File**: `src/components/hooks/useReviewSession.ts` (new)

**Intent**: Own all session state and the Again re-queue logic.

**Contract**: `useReviewSession(deckId)` returns `{ loading, error, current, remaining, reviewedCount, againCount, totalInitial, finished, showAnswer, reveal, rate }`.
- `reviewedCount`: distinct cards that have **left** the queue (rated Hard/Good/Easy). Increments only on the first non-Again rating per card.
- `againCount`: total Again ratings submitted during the session.
- `totalInitial`: number of due cards loaded at session start.
- State disambiguation: `finished && totalInitial === 0` → "0 due" screen; `finished && totalInitial > 0` → end-of-session summary.
- On mount: compute `due_before` = end of the user's local day as an ISO instant (`new Date()` → set to local 23:59:59.999 → `.toISOString()`), `fetch` `GET /api/decks/<id>/review?due_before=...`, seed the in-memory queue.
- `reveal()`: flips `showAnswer`.
- `rate(rating)`: `POST` to the submit endpoint; on success, if `rating === 1` (Again) move the card to the queue tail (refreshing its displayed SR fields from the response — display only; the server reloads state from the DB on the next rating), else remove it; advance to the next card; increment `reviewedCount` for distinct cards as needed; reset `showAnswer`. Errors surface via `error` without losing the queue.
- `finished` is true when the queue empties; expose summary counts.
- Follow the `fetch`/error-handling shape of `useDeckDetail.ts`.

#### 3. Session component + rating controls

**Files**: `src/components/review/ReviewSession.tsx` (new), `src/components/review/RatingButtons.tsx` (new)

**Intent**: Render the three states — loading/0-due, active card (question → reveal → rate), and end summary.

**Contract**:
- `ReviewSession`: consumes the hook. Loading → spinner text; empty initial queue → "0 due" screen with a back-to-deck link; `finished` → summary (cards reviewed, Again count) with links back to the deck and dashboard; otherwise the active-card view (front always shown; back shown after `reveal()`; a "Show answer" button before reveal; `RatingButtons` after).
- `RatingButtons`: four buttons mapped to `Rating.Again|Hard|Good|Easy` (`1|2|3|4`), disabled while a rating is in flight. Reuse the deck-page Tailwind idiom (`cn()` from `@/lib/utils`, the existing purple/white button styles).

#### 4. Entry-point CTAs

**Files**: `src/components/DeckDetailHeader.tsx` (or `DeckDetail.tsx`), `src/components/decks/DeckRow.tsx`

**Intent**: Let users start a review from the deck-detail page and the dashboard deck card.

**Contract**: Add a "Review" link/button pointing to `/deck/<id>/review`. On the deck-detail header, place it near the title; on the dashboard `DeckRow` dropdown, add a "Review" item above "Edit". Use existing link/button styles; no new dependencies.

### Success Criteria

#### Automated Verification

- Type checking passes: `npx astro check`.
- Linting passes: `npm run lint`.
- Production build succeeds: `npm run build`.

#### Manual Verification

- Deck with due cards: full loop works — question → reveal → rate → next; each rating persists immediately (verify in DB) and writes a `review_logs` row.
- Rating Again re-shows the card later in the same session; rating Hard/Good/Easy removes it; session ends at an accurate summary.
- Deck with no due cards shows the "0 due" screen.
- Review CTAs appear and navigate correctly from both the deck page and the dashboard deck card.
- No regressions in deck/card CRUD flows.

**Implementation Note**: Final phase — confirm the full manual walkthrough before marking S-03 done.

---

## Testing Strategy

No automated test runner exists in the repo yet (introduced in Module 3), so verification is `astro check` + lint + build + the manual walkthrough below.

### Manual Testing Steps

1. Seed a deck with a few cards; force some `card_sr_state.due` into the past via SQL.
2. Open the deck → click Review → confirm only due cards load.
3. Rate one card Again → confirm it reappears later in the session and `card_sr_state` + `review_logs` updated.
4. Rate the rest Good/Easy → confirm each persists and the summary count is correct.
5. Finish the session; reopen Review → confirm the just-reviewed cards are no longer due (their `due` advanced).
6. Open a deck with nothing due → confirm "0 due" screen.

## Performance Considerations

`loadDueCards` is a single indexed query (`card_sr_state_due_idx`) scoped by deck + user; uncapped result size is acceptable for MVP volumes. Each rating is one `UPDATE` + one `INSERT`. No N+1 — the session loads once and persists per rating.

## Migration Notes

- Additive only: `learning_steps` has a `DEFAULT 0` so existing rows backfill safely; `review_logs` is new. No backfill script needed.
- `elapsed_days` / `last_elapsed_days` are `@deprecated` in ts-fsrs and slated for removal in 6.0.0; a future major bump is a breaking change for both the schema mapping and `review_logs` — out of scope now, noted for whoever upgrades.

## References

- Research: `context/changes/review-session/research.md`
- ts-fsrs API doc: `context/changes/review-session/ts-fsrs-api-doc.md`
- Library selection: `context/changes/review-session/srs-library-research.md`
- API-route pattern: `src/pages/api/decks/[id]/cards.ts`, `src/pages/api/decks/[id].ts`
- Frontend pattern: `src/pages/deck/[id].astro`, `src/components/DeckDetail.tsx`, `src/components/hooks/useDeckDetail.ts`
- Schema: `supabase/migrations/20260526220447_initial_schema.sql:56-105`
- ts-fsrs types: `node_modules/ts-fsrs/dist/index.d.ts` (`Card` 41-57, `ReviewLog` 18-35, `RecordLogItem` 36-40, scheduler 446-483)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema & Types

#### Automated

- [x] 1.1 Migration applies cleanly to the local stack — f56d703
- [x] 1.2 `gen-types` adds `learning_steps` + `review_logs` to database.types.ts — f56d703
- [x] 1.3 Type checking passes: `npx astro check` — f56d703
- [x] 1.4 Linting passes: `npm run lint` — f56d703

#### Manual

- [ ] 1.5 `review_logs` RLS rejects non-owner insert, accepts owner
- [ ] 1.6 Existing `card_sr_state` rows show `learning_steps = 0`

### Phase 2: SR Service Layer

#### Automated

- [x] 2.1 Type checking passes: `npx astro check`
- [x] 2.2 Linting passes: `npm run lint`

#### Manual

- [ ] 2.3 `applyRating` updates `card_sr_state` and appends one `review_logs` row
- [ ] 2.4 Reset path matches `createEmptyCard()` output incl. `learning_steps = 0`

### Phase 3: API Routes

#### Automated

- [ ] 3.1 Type checking passes: `npx astro check`
- [ ] 3.2 Linting passes: `npm run lint`

#### Manual

- [ ] 3.3 `GET review` returns due-only cards; `[]` when none; `400` bad/missing `due_before`; `401` unauth
- [ ] 3.4 `POST` rating updates state and returns fresh SR; `rating:0` → `400`

### Phase 4: Review-Session UI

#### Automated

- [ ] 4.1 Type checking passes: `npx astro check`
- [ ] 4.2 Linting passes: `npm run lint`
- [ ] 4.3 Production build succeeds: `npm run build`

#### Manual

- [ ] 4.4 Full reveal→rate→persist loop works; each rating writes `card_sr_state` + `review_logs`
- [ ] 4.5 Again re-queues within session; Hard/Good/Easy removes; summary accurate
- [ ] 4.6 "0 due" screen shows when nothing due
- [ ] 4.7 Review CTAs appear and navigate from deck page and dashboard deck card
- [ ] 4.8 No regressions in deck/card CRUD
