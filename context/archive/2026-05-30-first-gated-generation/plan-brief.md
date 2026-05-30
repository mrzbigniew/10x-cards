# First Gated AI Generation — Plan Brief

> Full plan: `context/changes/first-gated-generation/plan.md`

## What & Why

S-01 is the product's north-star slice: a signed-in user pastes their own notes or textbook text, the app calls an LLM via OpenRouter, and returns a list of flashcard proposals the student can accept, edit inline, or reject — then saves the accepted cards to a new deck. This is the slice that proves (or disproves) the core hypothesis: AI proposals drawn from the student's own material are good enough to actually use.

## Starting Point

F-01 is complete: `decks`, `cards`, and `card_sr_state` tables exist with RLS; `cards.source` distinguishes `'ai'` from `'manual'`; `card_sr_state` is auto-populated by a DB trigger on card insert. Auth is wired (Supabase SSR, middleware, `context.locals.user`). There is no AI client, no generation endpoint, and the dashboard is a placeholder with no links to any generation flow.

## Desired End State

A signed-in user on `/generate` pastes 50–10,000 characters of text, clicks "Generate flashcards", waits through a loading indicator (~15 s median), reviews proposals (accept / inline-edit / reject / bulk actions), names their new deck (auto-proposed from the first 50 chars of input), and saves. Accepted cards land in `cards` with `source = 'ai'`; SR state rows are created automatically. On AI error, a banner appears and the pasted text is preserved.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| AI provider | OpenRouter (model-agnostic) | Single API key, ability to swap models without code changes | Plan |
| Default model | `openai/gpt-4o-mini` | Best cost/quality balance for Polish language tasks; easy to swap via a named constant | Plan |
| Prompt language | English system prompt; output matches input language | Model follows language of source text; English instructions give better instruction-following | Plan |
| Streaming | None — full response | Simpler Cloudflare Workers code; loading spinner covers the wait; no partial-JSON edge cases | Plan |
| Page location | New `/generate` route | Clean URL, no dashboard clutter, easy to link from nav | Plan |
| Undecided proposals at save | Skip with warning | No silent data loss; user can still bulk-accept before saving | Plan |
| Auto-save draft | No (accepted risk) | Zero implementation cost; re-generation is fast enough for MVP | Plan |
| Inline edit | Textarea toggle in-row | PRD specifies inline; no modal overlay; matches the spec exactly | Plan |
| Input validation | Min 50 / max 10,000 chars, Zod both sides | Prevents useless single-word requests; matches NFR max-input cap | Plan |
| Error recovery | In-page banner + "Try again", text preserved | Satisfies FR-007; no auto-retry (deferred to v2 per PRD Open Q4) | Plan |
| API structure | Two endpoints: `/api/generate` + `/api/decks` | Clear separation; generate can be retried without re-saving | Plan |
| Testing | Unit-test parsing/validation; manual full flow | LLM credits stay out of CI; covers the failure modes that break production | Plan |

## Scope

**In scope:**
- `POST /api/generate` — calls OpenRouter, returns proposals
- `POST /api/decks` — creates deck + bulk-inserts accepted cards
- `/generate` Astro page + React component tree (paste form, proposal list with inline edit, save form)
- Middleware extension for `/generate` (redirect) and API endpoints (401)
- Topbar "Generate" link + dashboard CTA
- Secrets template (`.dev.vars`) for local dev

**Out of scope:**
- Saving to an existing deck (S-02)
- Streaming proposals
- Auto-save of the review draft
- Auto-retry with backoff
- Any deck/card management beyond the new-deck save path

## Architecture / Approach

```
Browser (React island)
  TextInputForm → POST /api/generate → generation.ts service → OpenRouter
  ProposalList / ProposalRow (inline edit, bulk actions)
  SaveDeckForm → POST /api/decks → decks.ts service → Supabase
    decks.insert({ name, user_id }) → cards.insert([...]) → DB trigger → card_sr_state
```

State lives in `useGeneration` hook (phase machine: `input → generating → reviewing → saving → done`). Components are presentation-only. Services are thin wrappers testable without HTTP.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. API Layer | Working `/api/generate` and `/api/decks` endpoints, curl-verifiable | OpenRouter key not yet wired in Cloudflare Workers secrets |
| 2. Frontend | Full `/generate` page with proposal review UX | State machine complexity; inline edit textarea edge cases |
| 3. Navigation + Wiring | Topbar link, dashboard CTA, secrets template, E2E verification | Integration bugs surface only here |

**Prerequisites:** F-01 done (✓); `OPENROUTER_API_KEY` obtained and set in `.dev.vars` for local dev
**Estimated effort:** ~3 focused sessions across 3 phases

## Open Risks & Assumptions

- OpenRouter / `gpt-4o-mini` Polish-language quality is unvalidated — the 75% acceptance rate target is only measurable after real user traffic (PRD Open Q9)
- The model must reliably return valid JSON — a bad response triggers the error banner; no partial recovery
- `OPENROUTER_API_KEY` must be set as a Cloudflare Workers secret before the production deployment works

## Success Criteria (Summary)

- User can paste Polish text and receive 5–15 flashcard proposals in Polish
- Accept / edit / reject / bulk actions all update state correctly; accepted cards save to a new DB deck
- AI errors surface a banner with the original text preserved; unauthenticated requests are rejected
