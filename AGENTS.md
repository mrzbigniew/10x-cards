## Key conventions

- **Path alias**: `@/*` → `./src/*` (tsconfig paths).
- **Class merging**: always use the `cn()` helper from `@/lib/utils` (clsx + tailwind-merge). Never concatenate Tailwind class strings manually.
- **shadcn/ui**: components live in `src/components/ui/`, "new-york" style. Add new ones with `npx shadcn@latest add [name]`.
- **API routes**: use named exports `GET`, `POST`, etc.; validate input with Zod.
- **React hooks**: extract to `src/components/hooks/`.
- **Services/helpers**: `src/lib/` or `src/lib/services/` for business logic.
- **Shared types**: Zod schemas in `src/lib/schemas/`; generated DB types in `src/lib/database.types.ts`.
- **No Next.js directives** (`"use client"` etc.) — this is not Next.js.
- **All pages are server-rendered** - API routes must export `const prerender = false`.
- **Commands**:
  - `npm run dev`: start the development server
  - `npm run test`: run tests
  - `npm run lint`: run ESLint
  - `npm run typecheck`: run `astro check`
  - `npm run build`: build the project
  - `npx playwright test`: run Playwright tests
  - `npx wrangler deploy`: deploy Cloudflare Worker
  - `npx supabase db push`: push Supabase schema changes
  - `npm run gen-types`: regenerate `src/lib/database.types.ts` after schema changes
- **Quality gates**: CI (@.github/workflows/ci.yml) runs lint → typecheck → test → build on push/PR to `main`. Husky pre-commit runs lint-staged + typecheck; pre-push runs tests.

## Mutation testing

Repo uses Stryker for selective mutation testing on risk-critical modules.
Run it only for code covered by the current change or a risk from context/foundation/test-plan.md,
prefer narrowed scope with --mutate "path/to/file.ts:start-end", and do not chase
100% mutation score. Survived mutants should be reviewed one by one: add an
assertion only when the mutant represents a user-visible or business-relevant bug.

## Commit message

You are an expert at writing Git commit messages. Your job is to write a clear and concise commit message that accurately summarizes the changes.
Follow the Conventional Commits specification:

```
<type>(<scope>): <description>
```

Examples:

```
feat(auth): add OAuth login support
fix(api): handle null user responses
refactor(cache): simplify invalidation logic
docs(readme): update installation instructions
test(auth): add login integration tests
chore(deps): update dependencies
```

Rules:

- Use one of these types when appropriate:
  - feat: a new feature
  - fix: a bug fix
  - refactor: code changes that neither fix a bug nor add a feature
  - docs: documentation changes
  - test: adding or updating tests
  - chore: maintenance tasks, tooling, dependencies, configuration
  - perf: performance improvements
  - build: build system or dependency changes
  - ci: CI/CD changes
  - style: formatting or non-functional code style changes
- Include a scope when it can be determined from the changes.
- Use lowercase for the type and scope.
- Use the imperative mood in the description.
- Keep the description concise and ideally under 50 characters.
- Do not end the description with punctuation.
- Do not capitalize the first word of the description unless it is a proper noun or acronym.

Message body:

- If the change can be fully described by the subject line, omit the body.
- Only include a body when it provides useful context, rationale, or important implementation details.
- Separate the subject from the body with a blank line.
- Wrap body lines at 72 characters.
- Do not repeat information already present in the subject.

Output requirements:

- Return only the commit message.
- Do not include explanations, meta-commentary, markdown formatting, or raw diff output.
- Infer the most appropriate Conventional Commit type and scope from the changes.
