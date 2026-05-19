---
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
---

## Why this stack

A solo developer shipping a flashcard-generation MVP in 3 weeks (after-hours) with auth and AI-powered text-to-flashcard generation. The recommended default for (web-app, js) — Astro + React + Supabase + Cloudflare — ships authentication, PostgreSQL database, and edge deployment out of the box, eliminating integration cost for the two largest feature signals (auth and AI). TypeScript-first with Zod schemas at boundaries clears all four agent-friendly gates. Supabase handles user data isolation (RLS), password reset, and session management — three PRD requirements that would otherwise be custom work. AI generation calls to external LLM providers route through Astro API endpoints on Cloudflare Workers. The 3-week after-hours timeline makes a battle-tested, opinionated starter the right call over assembling pieces. CI runs on GitHub Actions with auto-deploy-on-merge to Cloudflare Pages.
