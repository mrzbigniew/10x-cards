# ts-fsrs API reference (10xCards)

> Fetched via Context7 (`/open-spaced-repetition/ts-fsrs`) for review-session (S-03) and SR state handling.
> Project pin: `ts-fsrs@^5.4.1` in `package.json`.

## Library

| Item | Value |
|------|--------|
| Context7 ID | `/open-spaced-repetition/ts-fsrs` |
| Hosted docs (alt) | `/websites/open-spaced-repetition_github_io_ts-fsrs` |
| Source | [github.com/open-spaced-repetition/ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) |

## Imports

```typescript
import { createEmptyCard, fsrs, Rating, State, type Card } from 'ts-fsrs'
```

## Scheduler

```typescript
const scheduler = fsrs()
// Optional: fsrs({ enable_fuzz: false }) for deterministic intervals
```

## Card states (`State` enum)

Maps 1:1 to `card_sr_state.state` (`smallint` 0–3). Do not store strings in the DB.

| Enum | DB value |
|------|----------|
| `State.New` | 0 |
| `State.Learning` | 1 |
| `State.Review` | 2 |
| `State.Relearning` | 3 |

## Review ratings (`Rating` enum)

Used in S-03 review loop (FR-014–FR-016). Native four-button scale:

```typescript
Rating.Again
Rating.Hard
Rating.Good
Rating.Easy
```

## New / reset card: `createEmptyCard()`

Canonical “never reviewed” card. Matches DB trigger defaults on `cards` INSERT (`state=0`, `due≈now()`, numeric fields zeroed).

```typescript
const card = createEmptyCard()
// Optional: createEmptyCard(now?) to set initial due
```

Use when:

- Validating what the `after_card_insert` trigger should produce
- Resetting SR after manual edit (S-04 checkbox) if not using `forget()`

## Review flow (S-03)

### Preview all outcomes before rating

```typescript
const preview = scheduler.repeat(card, new Date())
// preview[Rating.Again], preview[Rating.Hard], etc. each contain { card, log }
```

### Apply rating after user answers

```typescript
const result = scheduler.next(card, new Date(), Rating.Good)
// result.card — persist to card_sr_state
// result.log   — optional review log if storing history later
```

Prefer `repeat()` + `next()` for the standard review UI. Use `next_state()` / `next_interval()` only for simulations or custom pipelines.

## History helpers

| Method | Purpose |
|--------|---------|
| `scheduler.rollback(card, log)` | Undo last review from a log |
| `scheduler.forget(card, now, reset_count?)` | Treat card as forgotten; restart scheduling |
| `scheduler.reschedule(card, reviews, options?)` | Rebuild state from imported review history |

**S-04 “reset SR state”:** prefer `forget(current, now)` (or `createEmptyCard()`) and persist `result.card` — avoids hand-rolled zeros drifting from library defaults.

## Retrievability (optional)

```typescript
scheduler.get_retrievability(card, new Date(), isReview)
// Or: forgetting_curve(elapsed_days, stability, decay)
```

Not required for MVP review session; useful for analytics later.

## DB mapping: `card_sr_state` ↔ ts-fsrs `Card`

| `card_sr_state` column | FSRS `Card` field |
|------------------------|-------------------|
| `due` | `due` (`Date` ↔ ISO `timestamptz`) |
| `stability` | `stability` |
| `difficulty` | `difficulty` |
| `elapsed_days` | `elapsed_days` |
| `scheduled_days` | `scheduled_days` |
| `reps` | `reps` |
| `lapses` | `lapses` |
| `state` | `state` (0–3) |
| `last_review` | `last_review` (`null` if never reviewed) |

### Row → FSRS

```typescript
function rowToFsrsCard(row: CardSrStateRow): Card {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  }
}
```

### FSRS → DB update

```typescript
function fsrsCardToDbUpdate(card: Card) {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review?.toISOString() ?? null,
  }
}
```

## Slice responsibilities

### S-03: Review session

1. Load due cards: `card_sr_state.due <= end_of_today` (user timezone or UTC — pick one and document).
2. Map row → `Card`, run `scheduler.next(card, now, rating)`.
3. Persist `result.card` immediately after each rating (FR-015).
4. Expose `Rating` values as Again / Hard / Good / Easy in UI (FR-014).

### S-04: Manual card CRUD (already shipped)

| Action | ts-fsrs |
|--------|---------|
| Add card | None — DB trigger creates `card_sr_state` like `createEmptyCard()` |
| Edit, no reset | None |
| Edit + reset SR | `forget()` or `createEmptyCard()` → `UPDATE card_sr_state` (never DELETE+INSERT) |
| Delete card | None — cascade deletes `card_sr_state` |

**Guardrail (FR-011):** “reset SR” checkbox must default to **unchecked**.

## What not to use in MVP

- Custom in-house SR algorithm (PRD non-goal)
- Review log persistence unless explicitly planned
- `reschedule()` unless importing external history

## Existing code

- Service: `src/lib/services/cards.ts` — `resetCardSRState()` uses manual zeros; can be refactored to `forget()` / `createEmptyCard()`.
- Schema: F-01 migration / `src/lib/database.types.ts` — `card_sr_state` table.

## References

- [ts-fsrs README](https://github.com/open-spaced-repetition/ts-fsrs/blob/main/README.md)
- [packages/fsrs README](https://github.com/open-spaced-repetition/ts-fsrs/blob/main/packages/fsrs/README.md)
- Archived plan: `context/archive/2026-05-26-db-schema-rls/plan.md` (SR column design)
- Roadmap: `context/foundation/roadmap.md` — S-03, S-04
