---
date: 2026-06-02T18:31:00+02:00
researcher: mrzbigniew
git_commit: ee01778814515185941d04f1ae77238f93bd8b13
branch: main
repository: 10x-cards
topic: "Is ts-fsrs-api-doc.md compatible with the codebase for implementing S-03?"
tags: [research, codebase, ts-fsrs, review-session, S-03, card_sr_state]
status: complete
last_updated: 2026-06-02
last_updated_by: mrzbigniew
---

# Research: ts-fsrs API doc compatibility with the codebase (S-03)

**Date**: 2026-06-02T18:31:00+02:00
**Researcher**: mrzbigniew
**Git Commit**: ee01778814515185941d04f1ae77238f93bd8b13
**Branch**: main
**Repository**: 10x-cards

## Research Question

Review the codebase and decide whether `context/changes/review-session/ts-fsrs-api-doc.md` is compatible with it, with the goal of implementing roadmap slice **S-03 (review-session)** from `context/foundation/roadmap.md`.

## Summary

**Verdict: compatible, with one material gap that must be closed before/while implementing S-03.**

Almost every concrete claim in `ts-fsrs-api-doc.md` was verified against the live codebase and matches: the dependency, the `card_sr_state` schema, the generated DB types, the `State`/`Rating` enums, the auto-insert trigger, the existing `resetCardSRState()` helper, and the scheduler API surface (`next` / `repeat` / `createEmptyCard` / `forget`). The established API-route and service patterns the doc assumes also exist.

The one real problem: **ts-fsrs@5.4.1 defines `Card.learning_steps: number` as a required field.** This field has **no column** in `card_sr_state`, is **absent from `database.types.ts`**, and is **missing from the doc's `card_sr_state ↔ Card` mapping table and both `rowToFsrsCard()` / `fsrsCardToDbUpdate()` snippets**. As written, `rowToFsrsCard()` would be a TypeScript error (missing property), and `learning_steps` would not round-trip across review sessions. This is fixable (add a column, or reconstruct on load) but it is a genuine incompatibility between the doc and the installed library version, not a cosmetic one.

Two smaller notes (deprecated `elapsed_days`, over-loose `z.nativeEnum(Rating)` suggestion) are documented below.

## Detailed Findings

### Dependency — confirmed

- `package.json:37` pins `"ts-fsrs": "^5.4.1"` exactly as the doc claims.
- The package is installed: `node_modules/ts-fsrs/dist/index.d.ts` exists (verified via shell; `node_modules` is `.cursorignore`-filtered so the IDE search tools can't see it, but it is present and importable).

### `card_sr_state` schema — matches the doc's mapping (except `learning_steps`)

`supabase/migrations/20260526220447_initial_schema.sql:56-105` defines `card_sr_state` with a comment literally stating it "Holds the current ts-fsrs Card state" and "state values: 0=New 1=Learning 2=Review 3=Relearning". Columns present:

`due timestamptz`, `stability float4`, `difficulty float4`, `elapsed_days int4`, `scheduled_days int4`, `reps int4`, `lapses int4`, `state smallint CHECK (state IN (0,1,2,3))`, `last_review timestamptz` (nullable).

Every column in the doc's mapping table (`ts-fsrs-api-doc.md:101-149`) is present — **except `learning_steps` (see gap below)**. `last_review` nullability matches the doc's `last_review ? new Date(...) : undefined` handling.

### Generated types — match the schema

`src/lib/database.types.ts:37-95` exposes `card_sr_state` `Row` / `Insert` / `Update` with all nine SR fields plus `last_review: string | null`. So a typed Supabase select/update is available out of the box. (Same gap: no `learning_steps`.)

### Auto-insert trigger — matches `createEmptyCard()` semantics

`supabase/migrations/20260526220447_initial_schema.sql:90-105`: `after_card_insert` → `create_card_sr_state()` inserts a row using DB defaults (`state=0`, `due=now()`, numeric fields `0`, `last_review=null`). This is exactly the "new card" snapshot the doc describes (`ts-fsrs-api-doc.md:49-62`).

### State / Rating enums — exact match

From `node_modules/ts-fsrs/dist/index.d.ts`:

```ts
declare enum State { New = 0, Learning = 1, Review = 2, Relearning = 3 }
declare enum Rating { Manual = 0, Again = 1, Hard = 2, Good = 3, Easy = 4 }
type Grade = Exclude<Rating, Rating.Manual>;
```

- `State` 0–3 matches the DB `CHECK` and the migration comment.
- `Rating.Again | Hard | Good | Easy` matches the doc's four-button scale (`ts-fsrs-api-doc.md:38-47`).

### Scheduler API surface — matches the doc

From `index.d.ts`:

```ts
repeat(card: CardInput | Card, now: DateInput): IPreview;
next(card: CardInput | Card, now: DateInput, grade: Grade): RecordLogItem;
forget(card: CardInput | Card, now: DateInput, reset_count?: boolean): RecordLogItem;
createEmptyCard<R = Card>(now?: DateInput, afterHandler?: (card: Card) => R): R;
type RecordLogItem = { card: Card; log: ReviewLog };
type RecordLog = { [key in Grade]: RecordLogItem };
```

- The doc's `const result = scheduler.next(card, new Date(), Rating.Good)` then `result.card` / `result.log` is correct — `next()` returns `RecordLogItem = { card, log }`.
- The doc's `preview[Rating.Again]` is correct — `repeat()` returns `IPreview` (a `RecordLog` keyed by `Grade`, each holding `{ card, log }`).
- `forget()` and `createEmptyCard()` signatures match the S-04 reset guidance in the doc.

### API route / service patterns the doc assumes — present

`src/pages/api/decks/[id]/cards.ts` confirms the house pattern S-03 must follow: named export (`POST`), `export const prerender = false`, auth via `context.locals.user`, `createClient(headers, cookies)`, Zod `safeParse` against a schema in `src/lib/schemas/`, and delegation to a service in `src/lib/services/`. The doc's "service layer + Zod at boundary" plan (`srs-library-research.md:138-145`) fits this cleanly. Existing review-relevant routes: `src/pages/api/decks/[id]/cards.ts`, `src/pages/api/decks/[id]/cards/[cardId].ts`.

### Existing `resetCardSRState()` — exists, refactor candidate as the doc says

`src/lib/services/cards.ts:50-70` updates `card_sr_state` with hand-rolled zeros (`state:0, due:now, stability:0, difficulty:0, elapsed_days:0, scheduled_days:0, reps:0, lapses:0, last_review:null`). The doc correctly identifies this (`ts-fsrs-api-doc.md:177-179`) as refactorable to `createEmptyCard()` / `forget()`. Note this helper also omits `learning_steps`.

## The compatibility gap: `learning_steps`

`node_modules/ts-fsrs/dist/index.d.ts:43-57`:

```ts
interface Card {
    due: Date;
    stability: number;
    difficulty: number;
    /** @deprecated This field will be removed in version 6.0.0 */
    elapsed_days: number;
    scheduled_days: number;
    learning_steps: number;   // <-- required, not in DB / types / doc mapping
    reps: number;
    lapses: number;
    state: State;
    last_review?: Date;
}
```

`learning_steps` is **required** on both `Card` and `CardInput` (`CardInput extends Omit<Card, 'state'|'due'|'last_review'>`), and `next()` / `repeat()` accept only `CardInput | Card`. Consequences for the doc as written:

1. **Type error.** `rowToFsrsCard()` (`ts-fsrs-api-doc.md:118-131`) returns an object without `learning_steps`, so it is **not** assignable to `Card` → `tsc` / `astro check` fails.
2. **No persistence round-trip.** Even ignoring types, there is no `card_sr_state.learning_steps` column, so the value produced by `result.card` (`fsrsCardToDbUpdate`, `ts-fsrs-api-doc.md:135-148`) is dropped. `learning_steps` tracks position within the short-term Learning/Relearning step ladder; losing it between sessions degrades short-term scheduling correctness — which is exactly the S-03 NFR guardrail (`roadmap.md:139`).

### Two valid resolutions (decide in `/10x-plan`)

- **(A) Add the column — recommended.** New migration: `learning_steps int4 NOT NULL DEFAULT 0`; regenerate types (`npm run gen-types`); add the field to the mapping, to `fsrsCardToDbUpdate`, and to `resetCardSRState()`. Keeps `card_sr_state` a faithful `Card` snapshot, which is the stated design intent (`srs-library-research.md:31-44`).
- **(B) Reconstruct on load.** Set `learning_steps: 0` in `rowToFsrsCard()` and never persist it. Cheaper (no migration) but loses short-term step position for cards mid-Learning/Relearning across sessions. Acceptable only if the team accepts that minor inaccuracy.

This also reconciles the roadmap's still-open F-01 note "ts-fsrs vs SM-2 ... locking the SR-state column shape" (`roadmap.md:72-73`): the shape is FSRS-correct except for this one missing field.

## Minor notes

- **`elapsed_days` is `@deprecated`** (removed in ts-fsrs 6.0.0). Fine on the pinned `^5.4.1`, but any future major bump is a breaking change for both the schema and the doc's mapping. Worth a one-line note in the plan.
- **Rating validation should use `Grade`, not the full enum.** `srs-library-research.md:142` suggests `z.nativeEnum(Rating)`, which would accept `Rating.Manual = 0`. But `next()` requires `Grade = Exclude<Rating, Rating.Manual>`. Validate the API boundary to `1 | 2 | 3 | 4` (Again/Hard/Good/Easy) so `Manual` can't reach `next()`.
- **Due-date query is app logic, not library.** The doc/research correctly flag `due <= end_of_today` with a documented UTC-vs-user-timezone choice (`ts-fsrs-api-doc.md:155`, `srs-library-research.md:125`); `card_sr_state_due_idx` (migration line 77) already indexes `due`.

## Code References

- `package.json:37` — `ts-fsrs@^5.4.1` pin.
- `supabase/migrations/20260526220447_initial_schema.sql:56-105` — `card_sr_state` table, RLS, `after_card_insert` trigger.
- `src/lib/database.types.ts:37-95` — generated `card_sr_state` types (no `learning_steps`).
- `src/lib/services/cards.ts:50-70` — `resetCardSRState()` (manual zeros; refactor candidate; no `learning_steps`).
- `src/pages/api/decks/[id]/cards.ts:1-42` — canonical API-route pattern S-03 must follow.
- `node_modules/ts-fsrs/dist/index.d.ts:2-57` — `State`, `Rating`, `Grade`, `Card` (with required `learning_steps`), `RecordLogItem`.
- `node_modules/ts-fsrs/dist/index.d.ts:446-483` — `createEmptyCard`, `repeat`, `next`, `forget` signatures.

## Architecture Insights

- The codebase already treats `card_sr_state` as a literal ts-fsrs `Card` snapshot (one row per card via DB trigger), so S-03 is genuinely an *integration* task — service + API route + UI — not a library/algorithm decision. That decision was effectively locked at F-01.
- House conventions the plan should honor: services in `src/lib/services/`, Zod schemas in `src/lib/schemas/`, `prerender = false` + named-export API routes, `context.locals.user` for auth, `createClient(headers, cookies)` for a per-request RLS-scoped client. A dedicated `src/lib/services/sr.ts` (row↔Card mapper + `applyRating`) fits naturally.

## Historical Context (from prior changes)

- `context/archive/2026-05-26-db-schema-rls/` — F-01 designed the SR columns; the FSRS-shaped schema (and the `learning_steps` omission) originates here.
- `context/archive/2026-06-01-manual-card-crud/` — S-04 shipped `resetCardSRState()`; S-03 may refactor it to `forget()` / `createEmptyCard()`.

## Related Research

- `context/changes/review-session/srs-library-research.md` — library selection (ts-fsrs vs SM-2); concludes ts-fsrs is the only fit. This research confirms it but flags the `learning_steps` field that the selection doc's mapping table also omits.
- `context/changes/review-session/ts-fsrs-api-doc.md` — the artifact under review.

## Open Questions

1. **`learning_steps`: column (A) or reconstruct-on-load (B)?** Owner: implementation (decide in `/10x-plan`). Recommend (A).
2. **Due-date timezone policy** — UTC or user timezone for `due <= end_of_today`? (roadmap risk note; `srs-library-research.md:125`).
3. **Daily-load cap** (roadmap Open Question 7) — ship uncapped first.
4. **FSRS parameters** — default `fsrs()` vs pinned `FSRSParameters`? Document the choice in the plan.
