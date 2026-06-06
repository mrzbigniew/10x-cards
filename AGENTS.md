## Key conventions

- **Path alias**: `@/*` → `./src/*` (tsconfig paths).
- **Class merging**: always use the `cn()` helper from `@/lib/utils` (clsx + tailwind-merge). Never concatenate Tailwind class strings manually.
- **shadcn/ui**: components live in `src/components/ui/`, "new-york" style. Add new ones with `npx shadcn@latest add [name]`.
- **API routes**: use named exports `GET`, `POST`, etc.; validate input with Zod.
- **React hooks**: extract to `src/components/hooks/`.
- **Services/helpers**: `src/lib/` or `src/lib/services/` for business logic.
- **Shared types**: `src/types.ts`.
- **No Next.js directives** (`"use client"` etc.) — this is not Next.js.
- **All pages are server-rendered** - API routes must export `const prerender = false`.

## Mutation testing

Repo uses Stryker for selective mutation testing on risk-critical modules.
Run it only for code covered by the current change or a risk from test-plan.md,
prefer narrowed scope with --mutate "path/to/file.ts:start-end", and do not chase
100% mutation score. Survived mutants should be reviewed one by one: add an
assertion only when the mutant represents a user-visible or business-relevant bug.