import { fileURLToPath } from "node:url";
import process from "node:process";
import { reviewCode } from "./agent/reviewer";

// Public surface — safe to import without side effects.
export { model, reviewer, reviewCode, reviewPullRequest, ReviewSchema, type Review } from "./agent/reviewer";
export { REVIEW_SYSTEM_PROMPT, buildReviewPrompt, buildPullRequestPrompt } from "./prompts/review";
export { getLinesTool } from "./tools/get-lines";
export { renderComment, verdictFor, type Verdict } from "./ci/render";

// Smoke test: runs only when this file is the invoked entrypoint (e.g.
// `npm run dev`), never on import. Fires a live model call, so it must stay
// behind the main-module guard to keep the package import-safe for evals.
const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const sample = ["function add(a, b) {", "  const unused = 42;", "  return a + b;", "}"].join("\n");
  const review = await reviewCode(sample);
  console.log(JSON.stringify(review, null, 2));
}
