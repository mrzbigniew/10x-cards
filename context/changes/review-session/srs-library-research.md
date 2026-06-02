---
change_id: review-session
topic: srs-library-selection
status: complete
created: 2026-06-02
sources:
  - context/foundation/roadmap.md (S-03)
  - context/foundation/tech-stack.md
  - supabase/migrations/20260526220447_initial_schema.sql
  - Exa web_search_exa (2026-06-02)
---

# SRS library research for S-03 (review-session)

## Scope

Evaluate TypeScript/JavaScript spaced-repetition libraries compatible with the 10xCards stack (Astro 6 + React 19 + Supabase + Cloudflare Workers) and sufficient for roadmap slice **S-03: review-session** (US-03, FR-014–FR-016).

**S-03 outcome (from roadmap):** user starts a per-deck review for cards due today or overdue, reveals question → answer, rates recall on the SR library’s native scale (e.g. Again / Hard / Good / Easy), each rating is persisted immediately, session ends with a summary; “0 due” when nothing is scheduled.

## Stack constraints

| Constraint | Source |
|------------|--------|
| TypeScript-first, Zod at API boundaries | `tech-stack.md`, AGENTS.md |
| Server logic in Astro API routes on Cloudflare Workers | baseline + `wrangler.jsonc` (`nodejs_compat`) |
| SR state in Supabase `card_sr_state`, RLS per user | F-01 migration |
| No in-house SR algorithm in MVP | PRD / roadmap “Parked” |
| Algorithm correctness is an NFR guardrail | roadmap S-03 risk note |

## Schema lock-in (F-01)

F-01 already modeled `card_sr_state` as a **ts-fsrs `Card`** snapshot. The migration comment states this explicitly:

```sql
-- One row per card. Holds the current ts-fsrs Card state.
-- state values: 0=New 1=Learning 2=Review 3=Relearning
```

Columns: `due`, `stability`, `difficulty`, `elapsed_days`, `scheduled_days`, `reps`, `lapses`, `state`, `last_review`.

SM-2 libraries use a different model (`easeFactor`, `interval`, `repetitions`) and would require a **schema migration** plus data backfill. That is out of scope for S-03.

**Roadmap open question (F-01):** “ts-fsrs vs SM-2 variant” — **resolved in practice** by the shipped schema; research confirms FSRS-only libraries are the viable set.

## Research method

Web search via **Exa MCP** (`web_search_exa`), 2026-06-02:

1. `ts-fsrs` npm / TypeScript FSRS documentation and Card scheduling API
2. JavaScript/TypeScript spaced repetition libraries comparison FSRS vs SM-2 for flashcard apps

Canonical package docs: [ts-fsrs](https://open-spaced-repetition.github.io/ts-fsrs/), [GitHub: open-spaced-repetition/ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs).

## Candidate libraries

| Library | Algorithm | Fit to `card_sr_state` | Edge / Workers | Adoption / maintenance | Verdict |
|---------|-----------|------------------------|----------------|------------------------|---------|
| **`ts-fsrs`** | FSRS (v4/v5/v6) | **Exact** — field names and `state` enum match | Pure TS; Node ≥20 (OK with `nodejs_compat` on Workers) | Official FSRS TS impl; ~600+ GitHub stars; active | **Recommended** |
| `@squeakyrobot/fsrs` | FSRS v4.5 (+ optional v6) | Good (same DSR fields) | Explicitly Workers / Edge / Deno | Smaller, newer | Alternative only if ts-fsrs blocked |
| `quanta-fsrs` | FSRS v4.5/5 | Good | Zero deps, Workers claimed | Low adoption, single maintainer | Not recommended for MVP |
| `srs-everything` | FSRS + queues, topics, interleaving | Good but oversized API | ESM/CJS | Extra concepts beyond S-03 | Overkill |
| `@open-spaced-repetition/sm-2` | SM-2 | **Poor** — wrong columns | Yes | From same org as ts-fsrs | Rejected (schema mismatch) |
| `supermemo` (viendinhcom) | SM-2 | **Poor** | Yes | Mature SM-2 port | Rejected (schema mismatch) |
| `spaced-repetition` (Monkey-Dev-Vibes) | SM-2 pure function | **Poor** | Yes | Honest FSRS comparison in README | Rejected (schema mismatch) |

### Why FSRS over SM-2 (for this project)

- **Schema already FSRS-shaped** — no migration cost.
- **Native 4-button scale** — `Rating.Again | Hard | Good | Easy` matches S-03 UX and FR-015.
- **Benchmarks** (vendor / community): FSRS predicts recall better than SM-2 on large Anki review datasets; relevant for long-term product quality, not blocking MVP with defaults.
- **Roadmap** parked “in-house SR”; PRD expects a ready OSS library — ts-fsrs is the reference implementation in the FSRS ecosystem.

## Recommendation

**Use `ts-fsrs`** for S-03 scheduling logic.

**Already in repo:** `package.json` lists `"ts-fsrs": "^5.4.1"`. No new dependency required for the algorithm; S-03 work is integration (service layer, API routes, UI), not library selection.

**Optional later:** `@open-spaced-repetition/binding` — FSRS parameter **optimizer** from review logs. Not needed for MVP (default `fsrs()` parameters are sufficient per ts-fsrs docs).

## `card_sr_state` ↔ ts-fsrs `Card` mapping

| DB column (`card_sr_state`) | ts-fsrs `Card` | Notes |
|-----------------------------|----------------|-------|
| `due` | `due` | DB: `timestamptz` / ISO string; lib: `Date` — convert at boundary |
| `stability` | `stability` | `float4` |
| `difficulty` | `difficulty` | `float4` |
| `elapsed_days` | `elapsed_days` | `int4` |
| `scheduled_days` | `scheduled_days` | `int4` |
| `reps` | `reps` | `int4` |
| `lapses` | `lapses` | `int4` |
| `state` | `state` | `0=New, 1=Learning, 2=Review, 3=Relearning` — matches `State` enum |
| `last_review` | `last_review` | nullable; `Date` ↔ ISO string |

Card content (`front` / `back`) lives in `cards`; join when loading a review session.

**Existing helper:** `resetCardSRState()` in `src/lib/services/cards.ts` resets to new-card defaults consistent with `createEmptyCard()` semantics.

## ts-fsrs API surface relevant to S-03

```ts
import { createEmptyCard, fsrs, Rating } from "ts-fsrs";

const scheduler = fsrs(); // default params OK for MVP

// After user rates — persist result.card to card_sr_state
const result = scheduler.next(card, new Date(), Rating.Good);

// Optional: preview intervals before rating (UI “next review if Good” hints)
const preview = scheduler.repeat(card, new Date());
```

| Method | S-03 use |
|--------|----------|
| `fsrs(params?)` | Single scheduler instance (defaults; pin params in code if customized) |
| `createEmptyCard()` | Reference for reset / new card (trigger already creates DB row) |
| `next(card, now, rating)` | **Primary** — apply rating after user answers |
| `repeat(card, now)` | Optional — show four outcomes before commit |
| `get_retrievability(card, now)` | Optional — analytics / debug only |
| `forget` / `rollback` / `reschedule` | S-04 reset path uses manual DB reset today; reschedule only if importing history |

**Persistence pattern:** use `afterHandler` on `next()` to map `Date` fields to ISO strings before Supabase `update`, or map in a dedicated `src/lib/services/sr.ts` mapper validated with Zod.

**Due query (app logic, not library):** `due <= end_of_today` in user timezone (or UTC with documented policy) — validate against ts-fsrs test suite / golden cases per roadmap risk note.

## Compatibility checklist (tech stack)

| Check | Status |
|-------|--------|
| TypeScript types exported | Yes |
| Zod validation at API boundary | Recommended for row ↔ Card mapping |
| Runs on Cloudflare Workers API routes | Yes (pure TS; verify with smoke test) |
| No ORM / storage bundled in library | Yes |
| Matches Supabase RLS model (per-user updates) | App responsibility |
| 4-grade rating UI | `Rating` enum |

## Implementation notes for `/10x-plan`

1. **Service layer:** `src/lib/services/sr.ts` (or extend `cards.ts`) — `rowToCard`, `cardToUpdate`, `applyRating(cardId, rating)`.
2. **Due cards query:** Supabase select on `card_sr_state` joined to `cards` filtered by `deck_id` and `due <= today`.
3. **API:** `POST` review rating endpoint with Zod `rating: z.nativeEnum(Rating)` or `z.union([z.literal(1), ...])` matching ts-fsrs.
4. **Tests:** run or port ts-fsrs scheduling cases for “due today” edge cases; add integration test for reset + review loop.
5. **Params:** document chosen `FSRSParameters` in plan (defaults vs custom); no per-user optimizer in MVP.
6. **Open roadmap Q7:** daily cap — ship uncapped first; library does not enforce session caps.

## Alternatives considered and rejected

- **SM-2 packages** — would invalidate F-01 schema and duplicate work from S-04’s `resetCardSRState`.
- **Wrapper libraries (`srs-everything`)** — add scheduling features (queues, topic cards) not in PRD.
- **Fork / vendoring FSRS** — violates PRD non-goal (in-house algorithm).

## Conclusion

For S-03, **`ts-fsrs` is the only library that fits the existing database design, stack, and product requirements without migration.** It is already a project dependency; S-03 should implement the review loop and persistence layer on top of it, with explicit Date/ISO mapping and due-date query tests.
