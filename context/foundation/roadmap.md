---
project: "10xCards"
version: 1
status: draft
created: 2026-05-25
updated: 2026-05-30
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: 10xCards

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

10xCards removes the activation cost of spaced repetition for Polish high-school students preparing for the matura exam. The product lets a student paste their own notes or textbook text, receive AI-generated flashcard proposals, and accept, edit, or reject each one before the accepted cards enter a spaced-repetition schedule. The core differentiation: cards are grounded in the student's own source material rather than a generic internet deck, so curriculum fit and relevance follow automatically — without any manual card-writing work.

## North star

**S-01: user can paste text and save their first AI-generated deck** — the smallest end-to-end flow that directly tests the product's core hypothesis (the assumption that AI proposals drawn from the student's own text are good enough to actually use, as measured by the 75% acceptance rate primary success criterion).

> "North star" here means the smallest end-to-end slice whose successful delivery would prove the core product hypothesis — placed as early as Prerequisites allow because every other slice only matters if this one works.

## At a glance

| ID    | Change ID               | Outcome (user can …)                                                                    | Prerequisites     | PRD refs                                          | Status   |
| ----- | ----------------------- | --------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------- | -------- |
| F-01  | db-schema-rls           | (foundation) Supabase schema migrations + RLS in place for all app data                 | —                 | NFR (isolation, durability), FR-001, FR-002, FR-003, FR-005 | done     |
| S-01  | first-gated-generation  | paste text, review AI proposals (accept/edit/reject, bulk actions), save to new deck    | F-01              | US-01, FR-006, FR-007, FR-008, FR-009, FR-013     | done     |
| S-02  | deck-management         | view deck list, create/rename a deck, delete with confirmation, save to existing deck   | F-01              | US-01, US-02, FR-009, FR-013, FR-017              | done     |
| S-05  | password-reset          | reset a forgotten password via email link and recover all decks + SR state              | F-01              | US-04, FR-004                                     | proposed |
| S-04  | manual-card-crud        | add a card manually, edit any card (with optional SR reset), delete any card            | F-01, S-02        | US-02, US-05, FR-010, FR-011, FR-012              | proposed |
| S-03  | review-session          | run a per-deck review, rate each due card (SR library scale), persist SR state          | F-01, S-01, S-02  | US-03, FR-014, FR-015, FR-016                     | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                    | Chain                    | Note                                                                                              |
| ------ | ------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------- |
| A      | Core generation loop     | `F-01` → `S-01` → `S-03` | North-star path; S-03 joins Stream B at S-02 (requires S-02 complete before S-03 can run).       |
| B      | Deck and card management | `S-02` → `S-04`          | Requires F-01 (Stream A head); provides the deck context that both S-03 (Stream A) and S-04 need. |
| C      | Auth completeness        | `S-05`                   | Requires F-01 (Stream A head); independent of A and B; runs in parallel with S-01 and S-02.      |

## Baseline

What's already in place in the codebase as of 2026-05-25 (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6.3.1 + React 19, Tailwind CSS 4, Radix UI; file-based routing in `src/pages/`; pages include `src/pages/dashboard.astro`, `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`.
- **Backend / API:** partial — auth-only API routes in `src/pages/api/auth/` (signin.ts, signup.ts, signout.ts); no business logic endpoints yet.
- **Data:** partial — Supabase client configured (`supabase/config.toml`, project ID `10x-cards`, `@supabase/supabase-js` installed); `schema_paths = []`; no migration files exist.
- **Auth:** present — Supabase SSR auth (`@supabase/ssr`), cookie-based sessions, route-guard middleware at `src/middleware.ts` (protects `/dashboard`); FR-001, FR-002, FR-003, FR-005 are already scaffolded.
- **Deploy / infra:** partial — Cloudflare Workers (`wrangler.jsonc`, compatibility_date 2026-05-08, nodejs_compat) + GitHub Actions CI (`.github/workflows/ci.yml`); production secrets not yet wired.
- **Observability:** absent — no logging library, error tracking, or metrics integrations.

## Foundations

### F-01: Database schema + RLS

- **Outcome:** (foundation) Supabase migration files are in place for `decks`, `cards`, and SR-state tables; RLS policies enforce per-user data isolation via `auth.uid()`; the app-level schema makes the already-scaffolded auth (FR-001..FR-003, FR-005) meaningful by protecting the data it gates.
- **Change ID:** db-schema-rls
- **PRD refs:** NFR (user data isolation, durability of flashcards and SR state), Access Control (data isolation boundary), FR-001, FR-002, FR-003, FR-005
- **Unlocks:** S-01, S-02, S-03, S-04, S-05
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** SR library choice (ts-fsrs vs SM-2 variant) affects the shape of SR-state columns — Owner: implementation. Block: no (decide as the first act of F-01 implementation to avoid schema rework later).
- **Risk:** sequenced first because every slice depends on it; the main risk is locking the SR-state column shape before the library is chosen — mitigated by deciding the library upfront within F-01.
- **Status:** done

## Slices

### S-01: First gated AI generation

- **Outcome:** user can paste up to ~10,000 characters of plain text, trigger AI generation, see a list of proposed flashcards (question + answer), accept / edit inline / reject each proposal individually, bulk-accept or bulk-reject remaining undecided proposals, enter or accept an auto-proposed deck name, and save accepted cards to a newly created deck.
- **Change ID:** first-gated-generation
- **PRD refs:** US-01, FR-006, FR-007, FR-008, FR-009 (new-deck save path), FR-013 (create-deck capability embedded in save flow)
- **Prerequisites:** F-01
- **Parallel with:** S-02, S-05
- **Blockers:** AI provider API key must be set in Cloudflare Workers secrets before the generation call can succeed.
- **Unknowns:**
  - Default action for proposals left undecided at save time (Open Question 5) — Owner: user. Block: no (ship with "skip undecided, warn" as default; adjust after user feedback).
  - Exact maximum input length (Open Question 3) — Owner: implementation. Block: no (~10,000 chars placeholder is workable).
- **Risk:** AI response latency in Polish and the 75% acceptance rate are only observable after real usage; the product's primary success criterion cannot be validated until this slice ships — placing it first surfaces this risk as early as possible.
- **Status:** done

### S-02: Deck management

- **Outcome:** user can view all their decks on a list page, create a new named deck independently, rename any deck, delete a deck with a typed-name hard confirmation (no undo), and choose an existing deck as the target when saving generation results (completing the FR-009 existing-deck path started in S-01).
- **Change ID:** deck-management
- **PRD refs:** US-01 (existing-deck save path for FR-009), US-02 (deck picker for manual add), FR-009 (existing-deck path), FR-013 (create / rename / list), FR-017 (delete with typed-name confirmation)
- **Prerequisites:** F-01
- **Parallel with:** S-01, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** the typed-name delete confirmation is a specific UX piece (GitHub-style); if time is short, implement it as a plain text-input match without modal complexity — the PRD requires the behavior, not the visual treatment.
- **Status:** done

### S-05: Password reset

- **Outcome:** user can request a password reset, receive an email link, click it once within 24 h, set a new password, and sign in to find all existing decks and SR state intact; submitting a non-existent email returns the same neutral message as a valid one.
- **Change ID:** password-reset
- **PRD refs:** US-04, FR-004
- **Prerequisites:** F-01
- **Parallel with:** S-01, S-02
- **Blockers:** Transactional email delivery must be configured (Supabase built-in SMTP works for MVP; custom SMTP provider is an upgrade path).
- **Unknowns:**
  - SMTP provider choice — Owner: implementation. Block: no (Supabase built-in handles MVP scale; configure during implementation).
- **Risk:** reset emails landing in spam is a known failure mode outside the product's control; the UX should instruct users to check spam if the email doesn't arrive within a few minutes.
- **Status:** proposed

### S-04: Manual card CRUD

- **Outcome:** user can add a flashcard manually (non-empty question + answer) to any of their decks, edit any card's question or answer with an unchecked-by-default "reset SR state" checkbox for heavy rephrasing, and delete any card with no undo — the deck remains even if its last card is deleted.
- **Change ID:** manual-card-crud
- **PRD refs:** US-02, US-05, FR-010, FR-011, FR-012
- **Prerequisites:** F-01, S-02
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** the SR-reset checkbox must default to unchecked (FR-011 explicit requirement); a wrong default would silently destroy SR progress on every minor edit — verify the checkbox default in the first implementation pass.
- **Status:** proposed

### S-03: Review session

- **Outcome:** user can navigate to a deck, start a review session for cards due today (or overdue), see each card's question → reveal answer → rate recall using the SR library's native scale (e.g. Again / Hard / Good / Easy), have each rating persisted immediately after it is given, and reach a session-end summary; if no cards are due, a "0 due" screen explains the situation.
- **Change ID:** review-session
- **PRD refs:** US-03, FR-014, FR-015, FR-016
- **Prerequisites:** F-01, S-01, S-02
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:**
  - Daily-load cap (Open Question 7) — show all due cards or cap at N per session? Owner: implementation. Block: no (ship uncapped first; add cap in v2 if needed).
- **Risk:** SR algorithm correctness is a guardrail (NFR): a bug in "due ≤ today" logic fails silently and the student doesn't notice until cards are meaningfully delayed or lost — use the chosen library's own test suite to validate due-date computation before integrating.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID               | Suggested issue title                                                       | Ready for `/10x-plan` | Notes                         |
| ---------- | ----------------------- | --------------------------------------------------------------------------- | --------------------- | ----------------------------- |
| F-01       | db-schema-rls           | Set up Supabase migrations: decks, cards, SR-state tables + RLS policies    | yes                   | Run `/10x-plan db-schema-rls` |
| S-01       | first-gated-generation  | AI generation flow: paste text → proposals → review → save to new deck      | no                    | Needs F-01 done               |
| S-02       | deck-management         | Deck management: list / create / rename / delete + existing-deck save path  | no                    | Needs F-01 done               |
| S-05       | password-reset          | Password reset: forgot-password + email link + new-password pages           | no                    | Needs F-01 done               |
| S-04       | manual-card-crud        | Manual flashcard CRUD: add / edit (SR-reset option) / delete                | no                    | Needs S-02 done               |
| S-03       | review-session          | Review session: SR-scheduled cards, rating loop, state persistence          | no                    | Needs S-01 + S-02 done        |

## Open Roadmap Questions

1. **Anti-bot mitigation on signup** — does MVP ship CAPTCHA / honeypot / signup rate-limit, or is it deferred to v2? Owner: user. Block: no slice directly gated; affects the signup UX in the already-scaffolded auth flow.
2. **Auto-logout after N minutes of inactivity** — is it in MVP, and what is N? Owner: user. Block: no slice gated; affects the session NFR.
3. **Maximum input length (exact value)** — ~10,000 chars is the placeholder; true value depends on AI provider token cost. Owner: implementation (decide during S-01). Block: no.
4. **Auto-retry with exponential backoff on AI errors** — MVP or v2? Owner: implementation. Block: no.
5. **Default action for undecided proposals at deck-save time** — accepted by default? rejected? warning? Owner: user. Block: S-01 UX completeness (a default must be chosen during implementation; "skip with warning" is a reasonable fallback).
6. **Auto-save of the proposal draft before saving the deck** — MVP or v2? Accept the risk of losing the review if the browser tab is closed? Owner: user. Block: no.
7. **Daily-load cap in a review session** — show all due cards or cap at N per session? Owner: implementation. Block: no.
8. **Session lifecycle policy (duration, post-close behavior)** — pin values during implementation. Owner: implementation. Block: no.
9. **AI proposal quality in Polish** — is 75% acceptance achievable with a default prompt and available models, or does it require per-subject calibration? Owner: testing post-launch. Block: no.

## Parked

- **In-house SR algorithm** — Why parked: PRD §Non-Goals; MVP uses a ready open-source library (e.g. ts-fsrs or SM-2 equivalent).
- **File imports (PDF, DOCX, images, OCR)** — Why parked: PRD §Non-Goals; plain-text paste only in MVP.
- **Deck sharing between users** — Why parked: PRD §Non-Goals; single-user closed ecosystem.
- **Educational platform integrations (Anki, Quizlet, Moodle)** — Why parked: PRD §Non-Goals; standalone app.
- **Native mobile apps (iOS / Android)** — Why parked: PRD §Non-Goals; web-only with graceful degradation on narrow viewports.
- **OAuth / social login / magic-link** — Why parked: PRD §Non-Goals; email + password only in MVP.
- **Teacher / admin / student roles** — Why parked: PRD §Non-Goals; flat user model.
- **Folders / tags / colors / custom deck sorting** — Why parked: PRD §Non-Goals; flat list in MVP.
- **Undo / trash / soft-delete** — Why parked: PRD §Non-Goals; hard-delete with typed confirmation for decks.
- **Multi-device sync with conflict resolution** — Why parked: PRD §Non-Goals; one-device assumption in MVP.
- **Cross-deck review sessions** — Why parked: PRD §Non-Goals; per-deck review in MVP.
- **Demo without account** — Why parked: PRD §Non-Goals; fully gated app.
- **Offline-first / PWA-installable** — Why parked: PRD §Non-Goals; requires internet connection.
- **Full WCAG-AA accessibility audit** — Why parked: PRD §Non-Goals; baseline-friendly UX only.
- **Compliance beyond GDPR baseline (SOC 2, ISO 27001)** — Why parked: PRD §Non-Goals.
- **In-house AI quality evaluation pipeline** — Why parked: PRD §Non-Goals; 75% acceptance metric measured from natural user behavior.
- **Internationalization (i18n) / multilingual UI** — Why parked: PRD §Non-Goals; Polish UI only.
- **Observability (structured logging, error tracking)** — Why parked: absent in baseline; no FR requires it; `speed` goal defers it to v2 when real usage surfaces patterns worth tracking.

## Done

- **F-01: (foundation) Supabase migration files are in place for `decks`, `cards`, and SR-state tables; RLS policies enforce per-user data isolation via `auth.uid()`; the app-level schema makes the already-scaffolded auth (FR-001..FR-003, FR-005) meaningful by protecting the data it gates.** — Archived 2026-05-30 → `context/archive/2026-05-26-db-schema-rls/`. Lesson: —.
- **S-01: user can paste up to ~10,000 characters of plain text, trigger AI generation, see a list of proposed flashcards (question + answer), accept / edit inline / reject each proposal individually, bulk-accept or bulk-reject remaining undecided proposals, enter or accept an auto-proposed deck name, and save accepted cards to a newly created deck.** — Archived 2026-05-30 → `context/archive/2026-05-30-first-gated-generation/`. Lesson: —.
- **S-02: user can view all their decks on a list page, create a new named deck independently, rename any deck, delete a deck with a typed-name hard confirmation (no undo), and choose an existing deck as the target when saving generation results (completing the FR-009 existing-deck path started in S-01).** — Archived 2026-05-30 → `context/archive/2026-05-30-deck-management/`. Lesson: —.
