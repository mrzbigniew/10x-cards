# Cloudflare Deployment Plan — 10x-cards

## Context

This is the first production deployment of an Astro 6 + React 19 + Supabase app to Cloudflare,
following `context/foundation/infrastructure.md` (recommends Cloudflare) and
`context/foundation/tech-stack.md` (Cloudflare, auto-deploy-on-merge).

**Critical correction to `infrastructure.md`:** Its "Getting Started" section prescribes
`wrangler pages deploy ./dist` and `wrangler pages secret put`. **These are wrong for this project.**
`@astrojs/cloudflare` **v13** (required by Astro 6) **dropped Cloudflare Pages support** — it now
targets **Cloudflare Workers** (Workers Static Assets model). The current `wrangler.jsonc` already
reflects this (`main: @astrojs/cloudflare/entrypoints/server` + `assets` binding). So the correct
commands are **`wrangler deploy`** and **`wrangler secret put`** (no `pages` subcommand).
Source: [Astro Cloudflare adapter docs](https://docs.astro.build/en/guides/integrations-guide/cloudflare/) —
"The Astro Cloudflare adapter no longer supports deployment on Cloudflare Pages."

**Current state (verified):**
- `wrangler.jsonc` correctly configured for Workers (`nodejs_compat`, ASSETS→`./dist`, observability on) but **Worker `name` is still `10x-astro-starter`** — `tech-stack.md` specifies `project_name: 10x-cards`, so rename before first deploy (the name becomes the `workers.dev` subdomain and is hard to change after).
- `astro.config.mjs`: `output: "server"`, cloudflare adapter, `astro:env` schema declares `SUPABASE_URL` + `SUPABASE_KEY` (server secrets).
- Only **2 secrets** needed: `SUPABASE_URL`, `SUPABASE_KEY`. **No LLM/AI integration exists yet** despite PRD framing — no AI keys to wire now.
- `.github/workflows/ci.yml` exists (lint + build, triggers on `master` so it never runs on `main`). **This will be deleted** — see decisions.
- No tests configured. `wrangler ^4.90.0` already a devDependency (use `npx wrangler`, no global install needed).

**Decisions (confirmed with user):**
- Deploy **locally first** (validate end-to-end), **then** wire auto-deploy.
- Auto-deploy is handled by **Cloudflare Workers Builds** (Cloudflare's native git integration), **NOT GitHub Actions**.
- **Remove GitHub Actions entirely** — delete `.github/workflows/ci.yml`. Workers Builds runs the build before each deploy.
- **Production (auto-deploy) branch = `main`.**
- Target the free **`*.workers.dev`** subdomain (custom domain deferred).
- Rename the project to `10x-cards` (matches `tech-stack.md`).

**Outcome:** a validated production Worker on `workers.dev`, **Cloudflare Workers Builds** auto-deploying on every push to `main`, and this artifact as the "what's already deployed" audit trail.

---

## Phase 0 — Prerequisites (accounts, CLI, services)

Most of this is **manual, human-only setup** (account creation, dashboard config). Do it once before Phase A. The agent can run the CLI/verify steps; the human does the browser/dashboard gates.

### 0.1 Local toolchain
- [x] **Node 22.14.0** active — repo pins it via `.nvmrc`. Verify `node -v` matches (`nvm use` if you use nvm). Mismatched Node can break the build.
- [x] **No global installs needed** — `wrangler ^4.90.0` and `supabase ^2.23.4` are already devDependencies. Always invoke as `npx wrangler …` / `npx supabase …` so the pinned version is used. Verify `npx wrangler --version`.

### 0.2 Cloudflare account + CLI auth
- [x] **Create a Cloudflare account** (free tier) at dash.cloudflare.com if you don't have one. *(manual gate)*
- [x] **Note your Account ID** — `c44521d937aa49d4290ace46c55e1661` (mr.zbigniew@gmail.com's Account).
- [x] **Authenticate wrangler locally** — completed via OAuth. Verified with `npx wrangler whoami`.
- [x] **No CI API token needed.** Workers Builds handles auth via GitHub App.

### 0.3 Supabase project + auth config
- [x] **Create a Supabase project** at supabase.com (free tier is fine for MVP). *(manual gate)*
- [x] **Collect the two secrets** — `SUPABASE_URL` and anon `SUPABASE_KEY` collected.
- [x] **Configure Auth URLs** — dashboard → Authentication → URL Configuration: set **Site URL** and add a **Redirect URL** for `https://10x-cards.mr-zbigniew.workers.dev` (and `http://localhost:4321` for local dev). *(revisit after B5)*
- [x] **Email confirmation setting** — Authentication → Providers → Email: decide whether "Confirm email" is on.
- [x] **(Optional) Link the Supabase CLI** — not required for this deploy.

### 0.4 Prerequisite gate
- [x] Confirm you now hold: Cloudflare account + Account ID + wrangler logged in; Supabase project + `SUPABASE_URL` + anon `SUPABASE_KEY`. Only then proceed to Phase A.

---

## Phase A — Local first deploy (validate end-to-end)

- [x] **A0. Rename project `10x-astro-starter` → `10x-cards`** — edited `wrangler.jsonc` line 3. (`package.json` was already `10x-cards`.)
- [x] **A1. Sanity build locally.** `npm run build` — clean. `./dist` produced with Worker entry. Two adapter warnings (IMAGES/SESSION bindings) are harmless — app doesn't use CF image resizing or CF Sessions.
- [ ] **A2. Create `.dev.vars`** — skipped for this session; do before local workerd dev testing.
- [x] **A3. Authenticate wrangler.** Already authenticated (`mr.zbigniew@gmail.com`, account `c44521d937aa49d4290ace46c55e1661`).
- [x] **A4. Set production secrets** — `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY` entered interactively. Attached to Worker `10x-cards`.
- [x] **A5. First deploy.** `npm run build && npx wrangler deploy` — Worker ID `9b9d1ef5-c79d-485f-9b63-27fbe0901feb`. Live at **`https://10x-cards.mr-zbigniew.workers.dev`**.
- [x] **A6. Smoke-test production** — see Verification section. Homepage 200 ✓, `/dashboard` → 302 `/auth/signin` ✓.

## Phase B — Auto-deploy via Cloudflare Workers Builds (no GitHub Actions)

Workers Builds connects the GitHub repo directly to the `10x-cards` Worker (created in A5); Cloudflare runs the build and deploys on every push to the production branch. No GitHub Actions, no API token.

- [x] **B1. Remove GitHub Actions.** Deleted `.github/workflows/ci.yml` and the now-empty `workflows/` directory.
- [x] **B2. Connect the repo in Workers Builds** — Cloudflare GitHub App authorized, repo connected.
- [x] **B3. Configure build settings** — production branch `main`, build command `npm run build`, deploy command default, root `/`.
- [x] **B4. Set build-time env vars** — `SUPABASE_URL` and `SUPABASE_KEY` added as build variables in dashboard.
- [x] **B5. Trigger & verify** — Workers Builds deploy triggered and confirmed. Smoke test re-run: homepage 200 ✓, auth guard 302 ✓.
- [x] **B6. Update Supabase Auth URLs** — Site URL + Redirect URL set to `https://10x-cards.mr-zbigniew.workers.dev` (and `http://localhost:4321` for local dev).

## Phase C — Finalize the artifact

- [x] **C1. Update this file** — completed 2026-05-24. Live URL: `https://10x-cards.mr-zbigniew.workers.dev`. Runtime secrets: `SUPABASE_URL`, `SUPABASE_KEY` (via `wrangler secret put`). Build vars: `SUPABASE_URL`, `SUPABASE_KEY` (dashboard). Auto-deploy: Workers Builds on push to `main`. Smoke test B5: homepage 200 ✓, auth guard 302 ✓. All phases complete.
- [x] **C2. (Optional) Correct `infrastructure.md`** "Getting Started" + Operational Story to the Workers model (`wrangler deploy` / `wrangler secret put`, drop `pages`; note auto-deploy is Workers Builds, not GitHub Actions), so the foundation contract stops prescribing the deprecated Pages path. Only edit if you want the contract clean.

---

## Files to be modified / created

| Path | Action |
| --- | --- |
| `.github/workflows/ci.yml` | **Delete** — GHA removed; Workers Builds handles deploy (B1) |
| `wrangler.jsonc` | Edit: rename `name` `10x-astro-starter`→`10x-cards` (A0); otherwise correct for Workers |
| `package.json` | Edit: rename `name` `10x-astro-starter`→`10x-cards` (A0) |
| `.dev.vars` | Create (gitignored) for local secrets (A2) |
| `context/changes/deployment/deploy-plan.md` | This file — updated on completion (C1) |
| `context/foundation/infrastructure.md` | Optional edit — fix Pages→Workers commands (C2) |
| `astro.config.mjs` | **No change** — already correct for Workers |

Most of the deploy wiring lives in the **Cloudflare dashboard** (Workers Builds config, build vars), not in repo files.

---

## Edge cases & external support set

These are the failure shapes specific to Astro 6 + Workers + Supabase. Each has a verification step or a reference to consult.

1. **`wrangler deploy` vs `wrangler pages deploy`** — using the Pages command will fail or create a stray Pages project. **Always `wrangler deploy`.** Ref: [Astro Cloudflare docs](https://docs.astro.build/en/guides/integrations-guide/cloudflare/), [Cloudflare Workers Astro guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/).
2. **`astro:env` secret resolution at runtime** — `SUPABASE_URL`/`SUPABASE_KEY` are read via `astro:env/server`. On Workers they must be set as **Worker secrets** (A4); locally via **`.dev.vars`** (A2). A missing secret surfaces as `undefined` at request time, not at build. If you see undefined env in prod, re-check `npx wrangler secret list`. Ref: [astro:env docs](https://docs.astro.build/en/guides/environment-variables/).
3. **`nodejs_compat` / `@supabase/ssr` on workerd** — the flag is already set in `wrangler.jsonc`. If a Supabase/cookie API hits a missing Node API on the edge, check the [Cloudflare nodejs_compat list](https://developers.cloudflare.com/workers/runtime-apis/nodejs/) and [GitHub: withastro/astro issues](https://github.com/withastro/astro/issues) for the specific API. (`infrastructure.md` risk register flags this as Medium/Medium.)
4. **Supabase auth cookies over SSR** — `src/middleware.ts` reads `supabase.auth.getUser()` and sets `context.locals.user`. Verify cookies set on the `.workers.dev` domain actually persist a session across requests in prod (not just locally). If auth "works locally, fails in prod," this is the usual culprit. Ref: [@supabase/ssr docs](https://supabase.com/docs/guides/auth/server-side/creating-a-client).
5. **CPU limit on free tier (50ms)** — only relevant once AI generation lands (not yet implemented). No action now; noted in risk register.
6. **Image optimization** — `infrastructure.md` flags Astro image optimization needs paid CF Image Resizing. The starter has no SSR image processing in scope; ignore unless added.
7. **`compatibility_date` drift** — pinned to `2026-05-08`. Leave as-is; bumping it can change runtime behavior. Only change deliberately.
8. **Production-access boundary** — per `CLAUDE.md`: with Workers Builds, Cloudflare auths via its **GitHub App scoped to just this repo** (no master API token in the repo or CI). Destructive ops (delete Worker, rotate Supabase keys, disconnect git) stay **human-only** in the dashboard.
9. **Workers Builds vs local deploy coexistence** — once git is connected (B2), prefer letting Workers Builds deploy from `main`. Ad-hoc local `wrangler deploy` still works but can deploy code that isn't on `main`, causing drift between the live Worker and the repo. Use local deploy only for Phase A / emergency, and re-sync by pushing to `main`.
10. **Build-time vs runtime env confusion** — the #1 Workers Builds gotcha here: forgetting that build vars (dashboard Build variables, for `astro build`) and runtime secrets (`wrangler secret put`, for request handling) are **separate**. A missing runtime secret builds fine but 500s at request time. If prod auth breaks but the build is green, check `npx wrangler secret list` (edge case #2).

---

## Verification (smoke test — run after A5, and again after B5)

Against the live `https://10x-cards.<account>.workers.dev`:

1. **Homepage 200** — `curl -I <url>` returns 200; HTML renders (SSR working).
2. **Auth guard** — visiting `/dashboard` unauthenticated redirects to `/auth/signin` (confirms middleware + `context.locals.user` on the edge).
3. **Sign-up** — POST `/api/auth/signup` with a test email creates a Supabase user (confirms `SUPABASE_URL`/`SUPABASE_KEY` secrets resolved at runtime — edge case #2/#4).
4. **Sign-in → dashboard** — sign in, confirm session cookie persists and `/dashboard` now loads (confirms SSR cookie handling, edge case #4).
5. **Sign-out** — POST `/api/auth/signout` clears session; `/dashboard` redirects again.
6. **Logs** — `npx wrangler tail` while exercising the flows; confirm no `nodejs_compat` / undefined-env errors (edge cases #2, #3).

If all six pass locally-deployed (Phase A) and again via the Workers Builds deploy (Phase B), the deploy is validated. Record results in this file (C1).
