---
bootstrapped_at: 2026-05-19T00:51:00Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: 10x-cards
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: 10x-cards
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

### Why this stack

A solo developer shipping a flashcard-generation MVP in 3 weeks (after-hours) with auth and AI-powered text-to-flashcard generation. The recommended default for (web-app, js) — Astro + React + Supabase + Cloudflare — ships authentication, PostgreSQL database, and edge deployment out of the box, eliminating integration cost for the two largest feature signals (auth and AI). TypeScript-first with Zod schemas at boundaries clears all four agent-friendly gates. Supabase handles user data isolation (RLS), password reset, and session management — three PRD requirements that would otherwise be custom work. AI generation calls to external LLM providers route through Astro API endpoints on Cloudflare Workers. The 3-week after-hours timeline makes a battle-tested, opinionated starter the right call over assembling pieces. CI runs on GitHub Actions with auto-deploy-on-merge to Cloudflare Pages.

## Pre-scaffold verification

| Signal | Value | Severity | Notes |
| --- | --- | --- | --- |
| npm package | not run | — | cmd_template uses `git clone`, not an npm create CLI; npm recency check skipped |
| GitHub repo | not run | — | `gh` CLI not found on this system; recency check unavailable |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 19 (astro.config.mjs, CLAUDE.md, components.json, eslint.config.js, node_modules, package.json, package-lock.json, public, README.md, src, supabase, tsconfig.json, wrangler.jsonc, .env.example, .github, .husky, .nvmrc, .prettierrc.json, .vscode)
**Conflicts (.scaffold siblings)**: none (false conflicts from an interrupted copy attempt were verified identical and cleaned up)
**.gitignore handling**: preserved — cwd .gitignore already contained all lines from the scaffold's .gitignore; no append needed
**.git/ from clone**: deleted before move-up (upstream starter history not carried forward)
**.bootstrap-scaffold cleanup**: deleted

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 1 HIGH, 10 MODERATE, 0 LOW
**Direct vs transitive**: 0/3/0/0 direct of total 0/1/10/0 (3 direct dependencies affected via transitive chains)

#### HIGH findings

- **devalue** (v5.6.3–5.8.0) — DoS via sparse array deserialization (GHSA-77vg-94rm-hx3p, CVSS 7.5). Transitive dependency. Fix available (`npm audit fix`).

#### MODERATE findings

Root advisories:

- **ws** (v8.0.0–8.20.0) — Uninitialized memory disclosure (GHSA-58qx-3vcg-4xpx, CVSS 4.4). Transitive via miniflare → wrangler, @cloudflare/vite-plugin → @astrojs/cloudflare. Also via @supabase/realtime-js.
- **yaml** (v2.0.0–2.8.2) — Stack Overflow via deeply nested YAML collections (GHSA-48c2-rrv3-qjmp, CVSS 4.3). Transitive via yaml-language-server → volar-service-yaml → @astrojs/language-server → @astrojs/check.

Propagation effects (not separate CVEs — these packages are flagged because they depend on the root advisories above):

- **@astrojs/check** (direct) — via @astrojs/language-server → volar-service-yaml → yaml
- **@astrojs/cloudflare** (direct) — via @cloudflare/vite-plugin, wrangler → ws
- **@astrojs/language-server** — via volar-service-yaml → yaml
- **@cloudflare/vite-plugin** — via miniflare, wrangler → ws
- **miniflare** — via ws
- **volar-service-yaml** — via yaml-language-server → yaml
- **wrangler** (direct) — via miniflare → ws
- **yaml-language-server** — via yaml

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint | Value |
| --- | --- |
| bootstrapper_confidence | first-class |
| quality_override | false |
| path_taken | standard |
| self_check_answers | null |
| team_size | solo |
| deployment_target | cloudflare-pages |
| ci_provider | github-actions |
| ci_default_flow | auto-deploy-on-merge |
| has_auth | true |
| has_payments | false |
| has_realtime | false |
| has_ai | true |
| has_background_jobs | false |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
