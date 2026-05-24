---
project: 10xCards
researched_at: 2026-05-22
recommended_platform: Cloudflare Pages + Workers
runner_up: Railway
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro + React
  runtime: Cloudflare Workers (Edge)
---

## Recommendation

**Deploy on Cloudflare Pages + Workers.**

Cloudflare is the strongest fit for a cost-sensitive MVP ($0/mo for 100k requests) built on Astro. It offers first-class support for the chosen tech stack, including near-zero cold starts and an agent-friendly CLI (`wrangler`). The existing starter is already optimized for this target. While it enforces strict CPU limits on the free tier, the request/response nature of 10xCards makes this a manageable constraint.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent docs | Stable API | MCP / Int. | Total |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Cloudflare** | Pass | Pass | Pass | Pass | Pass | **5/5** |
| **Vercel** | Pass | Pass | Pass | Pass | Pass | **5/5** |
| **Netlify** | Pass | Pass | Pass | Pass | Pass | **5/5** |
| **Railway** | Pass | Pass | Pass | Partial | Pass | **4.5/5** |
| **Render** | Pass | Pass | Pass | Pass | Pass | **5/5** |
| **Fly.io** | Pass | Pass | Partial | Pass | Partial | **3.5/5** |

### Shortlisted Platforms

#### 1. Cloudflare Pages + Workers (Recommended)

Won due to the best combination of cost ($0 tier is highly viable), performance (edge-native), and agent-readiness (GA MCP server and excellent docs). It directly supports the Astro adapter used in the project.

#### 2. Railway

Scored high for native co-location of PostgreSQL and Redis. It provides a more traditional "server" environment which avoids edge-specific CPU limits, but requires a $5/mo minimum commitment for the Hobby plan.

#### 3. Render

A strong alternative with a free tier and native Postgres support. It offers excellent LLM-optimized documentation. However, the free tier suffers from 30-60s cold starts after inactivity, which degrades the "always available" student experience.

## Anti-Bias Cross-Check: Cloudflare

### Devil's Advocate — Weaknesses

1. **CPU Runtime Limits**: The free tier's 50ms CPU limit can be hit by heavy AI text processing or complex SSR logic.
2. **Node.js Compatibility**: While improving, some common Node libraries still fail to run in the `workerd` environment.
3. **Vendor Lock-in**: Heavy reliance on D1 (SQL) or R2 (Storage) makes migrating to standard AWS/GCP or a VPS harder than with container-based platforms.
4. **Script Size**: The 10MB (compressed) limit for workers can be a bottleneck for large Astro apps with many server-side dependencies.

### Pre-Mortem — How This Could Fail

The project fails six months from now because we hit the 100k/day request limit during a peak study season (e.g., Matura exams). Since the free tier is a hard cap, the site goes dark without an immediate credit card upgrade. Additionally, a critical security patch in a Node.js dependency broke the edge deployment because the `nodejs_compat` layer didn't support a specific low-level API, leading to a frantic 48-hour refactor right before the deadline.

### Unknown Unknowns

1. **Astro 6 + Cloudflare**: The newest adapter versions use a local `workerd` instance that can behave differently from the production environment in subtle ways (e.g., env var availability).
2. **Image Optimization**: Astro's built-in image optimization requires Cloudflare's paid "Image Resizing" service ($5/mo) or an external provider; standard SSR image processing will fail on the free tier.
3. **Secret Propagation**: Secrets set via `wrangler` are sometimes distinct from environment variables set in the Pages dashboard, leading to "undefined" errors that are hard to debug for agents.

## Operational Story

- **Preview deploys**: Every PR/branch automatically builds to a unique `*.pages.dev` URL for isolated testing.
- **Secrets**: Managed via `wrangler secret put` for workers or the Cloudflare Pages dashboard for environment variables.
- **Rollback**: Instant rollback to previous deployments via the Cloudflare Dashboard or `wrangler pages deployment rollback`.
- **Approval**: The agent can deploy to preview; a human must approve/merge the PR to trigger a production deployment via GitHub Actions.
- **Logs**: Runtime logs are tailed in real-time using `wrangler pages deployment tail`.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
| :--- | :--- | :---: | :---: | :--- |
| CPU limit hit during AI tokenization | Pre-mortem | Medium | High | Offload heavy processing to client or use lightweight libs. |
| Node.js API incompatibility | Devil's advocate | Medium | Medium | Verify all 3rd party libs in the edge environment early. |
| 100k req/day free tier cap | Pre-mortem | Low | High | Monitor usage; prepare to switch to the $5/mo paid plan. |
| Image optimization failure | Unknown unknowns | High | Low | Use an external image CDN or disable SSR resizing. |

## Getting Started

1. **Install Tooling**: `npm install -g wrangler`
2. **Authenticate**: `wrangler login`
3. **Configure Astro**: The project already has `@astrojs/cloudflare`. Ensure `wrangler.jsonc` is present.
4. **Deploy**: `npm run build && wrangler pages deploy ./dist` (or rely on the pre-configured GitHub Action).
5. **Secrets**: Set Supabase and AI keys via `wrangler pages secret put [KEY_NAME]`.

## Out of Scope

- Docker image configuration (not used in Cloudflare)
- Multi-region database failover (Supabase handles DB availability)
- Enterprise-grade WAF/DDoS custom rules
