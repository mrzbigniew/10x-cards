import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { Output, ToolLoopAgent } from "ai";
import { z } from "zod";
import { buildPullRequestPrompt, buildReviewPrompt, REVIEW_SYSTEM_PROMPT } from "../prompts/review";
import { ReviewSchema, type Review } from "../schemas/review";
import { getLinesTool } from "../tools/get-lines";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export const model = openrouter("z-ai/glm-5.2");

/** Per-call options the reviewer accepts; carries the code under review. */
const callOptionsSchema = z.object({
  code: z.string(),
});

/**
 * Cap on review output tokens. Bounds cost per review and keeps requests within
 * typical OpenRouter key budgets; a structured `Review` needs far less. Without
 * it the request defaults to the model's full context, which can exceed a key's
 * affordable token budget (OpenRouter 402).
 */
const REVIEW_MAX_OUTPUT_TOKENS = 4000;

/**
 * Reusable, eval-ready code-review agent. Created once at module load. Per
 * request, `prepareCall` injects the call's `code` into `experimental_context`,
 * which the `get_lines` tool reads in its `execute` — so a single instance
 * serves many calls without closing over a fixed code string or being rebuilt.
 */
export const reviewer = new ToolLoopAgent({
  model,
  instructions: REVIEW_SYSTEM_PROMPT,
  tools: { get_lines: getLinesTool },
  output: Output.object({ schema: ReviewSchema }),
  maxOutputTokens: REVIEW_MAX_OUTPUT_TOKENS,
  callOptionsSchema,
  prepareCall: ({ options, ...settings }) => ({
    ...settings,
    experimental_context: { code: options.code },
  }),
});

export async function reviewCode(code: string): Promise<Review> {
  const { output } = await reviewer.generate({
    prompt: buildReviewPrompt(code),
    options: { code },
  });
  return output;
}

/**
 * Reviews a pull request (title/body/diff) and returns the same `Review`
 * shape as `reviewCode`. Reuses the shared agent instance; the diff is the
 * "code" passed via `experimental_context`, so `get_lines` cites diff lines.
 */
export async function reviewPullRequest(input: { title: string; body: string; diff: string }): Promise<Review> {
  const { output } = await reviewer.generate({
    prompt: buildPullRequestPrompt(input),
    options: { code: input.diff },
  });
  return output;
}

export { ReviewSchema, type Review };
