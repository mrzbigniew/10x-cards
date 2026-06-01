# Password Reset Flow — Plan Brief

> Full plan: `context/changes/password-reset/plan.md`

## What & Why

Implement S-05: a forgot-password → email link → new-password flow so users who lose access to their account can recover it without losing their decks or SR state. The recovery path uses Supabase's built-in PKCE token mechanism — no custom email or token infrastructure required.

## Starting Point

Supabase SSR auth is fully wired (`@supabase/ssr`, cookie-based sessions, route-guard middleware). Sign-in, sign-up, and sign-out flows are done. Supabase Inbucket captures dev emails at `localhost:54324`. There is no forgot-password page or reset-password page yet; there is no entry point from the sign-in page.

## Desired End State

A signed-out user can click "Forgot password?" on the sign-in page, enter their email, receive a recovery email (or see the same neutral page if the email is unknown), click the link within 24 hours, set a new password, and land directly on `/dashboard` — signed in, with all decks and SR state intact.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| After-submit UX | Dedicated `/auth/forgot-password-sent` page | Cleanest privacy-preserving response — always the same neutral page | Plan |
| Expired/bad token handling | Redirect to `/auth/forgot-password?error=...` | User lands on the actionable recovery form immediately | Plan |
| Post-reset redirect | Auto sign-in → `/dashboard` | Code exchange already establishes a session; extra sign-in step is redundant | Plan |
| Spam hint placement | On `/auth/forgot-password-sent` only | Shown exactly when relevant, not cluttering the request form | Plan |
| `redirectTo` construction | Dynamic from `context.request.url` | Works in local dev, Wrangler preview, and production without hardcoding | Plan |
| OTP expiry | 86400 s (24 h) in `config.toml` | Matches roadmap "click within 24 h" requirement | Plan |

## Scope

**In scope:**
- `/auth/forgot-password` page + `ForgotPasswordForm` component + API route
- `/auth/forgot-password-sent` confirmation page (with spam hint + dev Inbucket link)
- `/auth/reset-password` page (PKCE code exchange + session fallback) + `ResetPasswordForm` component + API route
- Middleware `PUBLIC_ROUTES` update (3 new entries)
- `supabase/config.toml` `otp_expiry` update to 86400
- "Forgot password?" link added to `SignInForm`

**Out of scope:**
- Custom SMTP provider (Supabase built-in for MVP)
- Rate-limiting on the forgot-password form (Supabase enforces 2 emails/hour)
- "Confirm old password" before reset
- Any schema changes

## Architecture / Approach

Pure Supabase PKCE auth flow — no custom token logic. The forgot-password API calls `resetPasswordForEmail(email, { redirectTo })` and ignores whether the email exists. The email link points to `/auth/reset-password?code=xxx`. The reset-password Astro page exchanges the code server-side via `exchangeCodeForSession(code)`, setting session cookies; if the code is absent or expired, it redirects to the forgot-password page with an error. After session is established, the reset-password API calls `updateUser({ password })` and redirects to `/dashboard`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Request Flow | Forgot-password page, API, confirmation page, middleware + config updates | Recovery email landing in spam (mitigated by spam hint on sent page) |
| 2. Reset Flow | Reset-password page (code exchange), form, API → auto sign-in to dashboard | Expired-code edge case if user delays; mitigated by session fallback and clear error redirect |
| 3. Sign-in Integration | "Forgot password?" link on sign-in page | None — purely additive change |

**Prerequisites:** F-01 done (Supabase schema + RLS in place); Supabase local stack running (`supabase start`)  
**Estimated effort:** ~1 session across 3 phases

## Open Risks & Assumptions

- Production Supabase project needs two manual dashboard changes after deploy: add `/auth/reset-password` to Redirect URLs, and set Email OTP Expiration to 86400 s — these are not in the codebase
- Recovery emails may land in spam; the sent page advises users to check, but this is outside product control

## Success Criteria (Summary)

- Submitting any email (registered or not) always shows the same neutral confirmation page
- A valid reset link allows the user to set a new password and land on `/dashboard` with all data intact
- An expired or reused link redirects to the forgot-password page with a clear error
