## Overall concept

- GHA workflow run for every new pull request to master
- composite action for the review itself so that main workflow is easy to reason about

## Input parameters

- pull request title
- pull request description (?? cost tradeoff)
- git diff

## Code Review Criteria

1. Focus on logic over syntax. Catch edge cases, race conditions, and logical flaws, not just linting errors that a standard CI pipeline would catch.
2. Prioritize security. Immediately flag hardcoded secrets, injection vectors (SQL/XSS), and broken access controls before reviewing anything else.
3. Match the existing style. Suggest refactors that align with the repository's current architectural patterns and naming conventions.
4. Explain the "why". Don't just dump corrected code—explain the underlying principle, vulnerability, or design pattern being addressed.
5. Highlight performance bottlenecks. Identify inefficient N+1 queries, nested loops, or memory leaks, and offer optimized alternatives.
6. Provide actionable fixes. Give specific, copy-pasteable code snippets rather than vague advice like "make this function more modular."
7. Check test coverage. Flag complex new logic or critical bug fixes that lack corresponding unit or integration tests.
8. Call out over-engineering. Warn against premature optimization or overly complex abstractions for simple, straightforward problems.
9. Praise good code. Briefly acknowledge elegant solutions or clean refactors to reinforce positive development patterns.
10. State assumptions clearly. If a suggested fix relies on a specific framework version, execution environment, or library, declare it upfront.

## Parked for later

- business alignment (require broader context)
- architectural fit (require broader context)

## Expected side-effects

- PR comment with summary
- labels: `ai-cr:failed` (red) OR `ai-cr:passed` (green)

## Expected behavior

- on-demand retry when label `ai-cr:review` is added
