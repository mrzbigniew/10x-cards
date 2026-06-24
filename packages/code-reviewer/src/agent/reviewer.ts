import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { Output, ToolLoopAgent } from "ai";
import { z } from "zod";
import { buildReviewPrompt, REVIEW_SYSTEM_PROMPT } from "../prompts/review";
import { ReviewSchema, type Review } from "../schemas/review";
import { getLinesTool } from "../tools/get-lines";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export const model = openrouter("openai/gpt-4o-mini");

/** Per-call options the reviewer accepts; carries the code under review. */
const callOptionsSchema = z.object({
  code: z.string(),
});

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

export { ReviewSchema, type Review };
