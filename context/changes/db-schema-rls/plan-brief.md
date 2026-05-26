# Database Schema + RLS — Plan Brief

> Full plan: `context/changes/db-schema-rls/plan.md`

## What & Why

Create the Supabase database schema that every other slice depends on: `decks`, `cards`, and `card_sr_state` tables with Row Level Security enforcing per-user isolation. Without this foundation, no slice can store or retrieve user data. F-01 is sequenced first in the roadmap precisely because it unlocks all five downstream slices (S-01 through S-05) in parallel.

## Starting Point

The repo has a fully wired Supabase auth layer (client, middleware, API routes) but `supabase/migrations/` is empty — there are no tables, no schema, and no TypeScript database types. The Supabase CLI (`^2.101.0`) and local stack config (`config.toml`) are already in place.

## Desired End State

Three tables exist in the local Supabase database, each protected by four RLS policies (SELECT/INSERT/UPDATE/DELETE restricted to the row owner). A database trigger auto-creates a `card_sr_state` row for every new card so review-session queries never need to handle missing SR state. TypeScript types are generated and committed at `src/lib/database.types.ts`, and `npm run typecheck` passes cleanly.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| SR algorithm library | ts-fsrs (FSRS) | Natively uses the Again/Hard/Good/Easy scale the PRD specifies; better retention than SM-2 | Plan |
| SR state location | Separate `card_sr_state` table (1:1 with cards) | Keeps card content and review progress logically separate; easier to zero-out SR state without touching the card row | Plan |
| `user_id` on cards and card_sr_state | Yes — denormalized | Enables direct `auth.uid() = user_id` RLS predicate on every table without nested selects | Plan |
| Card source tracking | `source` column (`'ai'` \| `'manual'`) | Required to measure the 75%-from-AI primary success criterion | Plan |
| Migration structure | Single file | Atomic apply/rollback; all tables and policies visible in one review | Plan |
| TypeScript types | Generated in this phase → `src/lib/database.types.ts` | Downstream slices get typed DB rows from day one; no `any` casts at boundaries | Plan |

## Scope

**In scope:**
- `decks`, `cards`, `card_sr_state` tables with all columns, constraints, and indexes
- RLS policies (4 per table, owner-only)
- `updated_at` trigger on all three tables
- Auto-create `card_sr_state` trigger on card insert
- `ts-fsrs` npm install
- TypeScript type generation + `gen-types` npm script

**Out of scope:**
- API routes, service layer, UI — all downstream slices
- Remote Supabase project push
- Review log / rating history table (v2)
- `generation_sessions` table (source text is transient per privacy NFR)

## Architecture / Approach

One SQL migration file applies all three tables in FK-dependency order (decks → cards → card_sr_state). RLS uses the same `auth.uid() = user_id` predicate on every table — no nested selects, no join-based policies. A `SECURITY DEFINER` trigger function auto-populates `card_sr_state` with FSRS defaults (`state=0`, `due=now()`) on every card insert, so new cards are immediately available for review without application-layer setup.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema Migration | All tables, RLS, triggers, indexes applied locally | Trigger bypassing RLS — mitigated by SECURITY DEFINER pattern |
| 2. TypeScript Types | `src/lib/database.types.ts` generated and committed | `supabase start` must be running; types drift if schema changes without regenerating |

**Prerequisites:** Docker running (for `supabase start`); no prior schema state to migrate from.
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- ts-fsrs Card interface fields are assumed stable at their current shape (due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review) — verify against installed package version before writing the migration.
- `state` column uses `smallint` (0–3) matching ts-fsrs integer enum values; if a future ts-fsrs major version changes enum representation, a migration will be needed.

## Success Criteria (Summary)

- `npx supabase db reset` applies the migration with no errors
- RLS isolation verified: a user cannot read another user's decks, cards, or SR state
- `npm run typecheck` exits 0 with the generated `database.types.ts` in place
