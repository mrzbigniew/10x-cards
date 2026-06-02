# S-03 Review Session — Plan Brief

> Full plan: `context/changes/review-session/plan.md`
> Research: `context/changes/review-session/research.md`
> ts-fsrs API doc: `context/changes/review-session/ts-fsrs-api-doc.md`

## What & Why

Implement S-03: a per-deck spaced-repetition review session. The user reviews cards due today (or overdue), reveals each answer, rates recall on the ts-fsrs four-button scale (Again / Hard / Good / Easy), and each rating is persisted immediately. This is the slice that finally puts the SR engine to work — every prior slice produces cards; this one schedules and drills them (US-03, FR-014–FR-016).

## Starting Point

`ts-fsrs@^5.4.1` is already installed and `card_sr_state` is already a faithful ts-fsrs `Card` snapshot, auto-created per card by a DB trigger. Decks, cards, auth, RLS, and the deck-detail UI all exist. So S-03 is integration — service + API + UI — not a library or schema-design decision.

## Desired End State

From a deck card or the deck page, the user clicks "Review" and runs a session: question → reveal → rate, with immediate persistence and a review-log row per rating. Cards rated Again re-appear later in the same session until passed; the session ends on a summary. When nothing is due, a "0 due" screen explains why.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| `learning_steps` gap | Add a DB column | Keeps `card_sr_state` a complete FSRS `Card` so step position round-trips; fixes the `tsc` error in the mapper | Research + Plan |
| "Due today" boundary | User timezone | "Today" matches the student's wall clock; client sends end-of-local-day as `due_before` | Plan |
| Again-rated cards | Re-queue within session | Real repetition UX — the student re-drills a just-failed card now, matching the requested "repetition session" | Plan |
| Daily load cap | Uncapped | Roadmap guidance ("ship uncapped first"); simplest | Research + Plan |
| FSRS parameters | Default `fsrs()` | Defaults sufficient for MVP; no optimizer | Research + Plan |
| Review-log history | Persist to new `review_logs` table | Enables future analytics/optimizer; chosen despite research's MVP deferral | Plan |
| Session state | Client-driven, stateless server | Each rating POSTed individually → immediate, crash-safe persistence (FR-015) | Plan |

## Scope

**In scope:** `learning_steps` column; `review_logs` table + RLS; `sr.ts` service (mappers, scheduler, due query, applyRating); GET due-cards + POST rating routes; review page + `useReviewSession` hook with Again re-queue; rating UI; entry-point CTAs; refactor of `resetCardSRState()`.

**Out of scope:** interval-preview button hints; daily cap; per-user optimizer; cross-deck review; rating undo; automated test harness.

## Architecture / Approach

Bottom-up: schema → generated types → `sr.ts` service → two API routes → review page/hook/components. The session lives in the client: load all due cards once (`GET`, with a user-timezone `due_before`), hold an in-memory queue, POST each rating individually. `applyRating` maps the row to a ts-fsrs `Card`, runs `scheduler.next()`, updates `card_sr_state`, and appends a `review_logs` row. Again re-queue is client-side queue manipulation re-using the fresh SR state returned by the POST.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema & Types | `learning_steps` column + `review_logs` table + regenerated types | Local Supabase stack required for `gen-types` |
| 2. SR Service | `sr.ts` mappers, due query, `applyRating`; reset refactor | Date↔ISO mapping correctness; persist ordering |
| 3. API Routes | GET due cards, POST rating; Zod (rating 1–4) | Boundary validation; rejecting Manual(0) |
| 4. Review UI | Page, hook (Again re-queue), components, CTAs | Re-queue must use updated SR state, not stale |

**Prerequisites:** F-01, S-01, S-02 done (they are); local Supabase stack running for the migration + type regen.
**Estimated effort:** ~2–3 sessions across 4 phases.

## Open Risks & Assumptions

- "Due ≤ today" correctness is an NFR guardrail — a bug delays/loses reviews silently; verify the boundary math and `due` advancement manually until a test runner exists (Module 3).
- Client-supplied `due_before` is trusted as a read filter; RLS still scopes rows to the owner, so the blast radius is at most a few hours of boundary skew.
- `elapsed_days`/`last_elapsed_days` are `@deprecated` in ts-fsrs (removed in 6.0.0) — a future major bump breaks the mapping and `review_logs`.

## Success Criteria (Summary)

- A user runs a full session: due cards load, answers reveal, ratings persist immediately, Again cards re-drill, session ends on an accurate summary.
- A deck with nothing due shows the "0 due" screen.
- `astro check`, lint, and build pass; deck/card CRUD unaffected.
