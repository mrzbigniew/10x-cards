import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { reviewPullRequest } from "../agent/reviewer";
import { renderComment, verdictFor } from "./render";

/**
 * Entry point the composite action runs via `tsx`. Reads PR context and the
 * diff (from a file), runs the review, computes the verdict, writes the
 * rendered comment to a file, and emits scalar outputs to `$GITHUB_OUTPUT`.
 *
 * Errors are never swallowed: any failure rejects and exits non-zero so a
 * broken review fails the step instead of silently passing.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const title = process.env.PR_TITLE ?? "";
const body = process.env.PR_BODY ?? "";
const diffPath = requireEnv("DIFF_PATH");
const githubOutput = requireEnv("GITHUB_OUTPUT");
const runnerTemp = requireEnv("RUNNER_TEMP");

const thresholdRaw = process.env.SCORE_THRESHOLD ?? "7";
const threshold = Number(thresholdRaw);
if (!Number.isFinite(threshold)) {
  throw new Error(`SCORE_THRESHOLD is not a number: ${thresholdRaw}`);
}

const diff = await readFile(diffPath, "utf8");

const review = await reviewPullRequest({ title, body, diff });
const verdict = verdictFor(review, threshold);
const comment = renderComment(review, verdict);

const commentPath = join(runnerTemp, "review.md");
await writeFile(commentPath, comment, "utf8");

await appendFile(githubOutput, `verdict=${verdict}\nscore=${review.score}\ncomment_path=${commentPath}\n`, "utf8");

console.log(`Review verdict: ${verdict} (score ${review.score}/10, threshold ${threshold})`);
