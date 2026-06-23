import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output } from "ai";
import { z } from "zod";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export const model = openrouter("openai/gpt-4o-mini");

export const ReviewSchema = z.object({
  summary: z.string(),
  issues: z.array(
    z.object({
      severity: z.enum(["error", "warning", "info"]),
      message: z.string(),
      line: z.number().optional(),
    }),
  ),
  score: z.number().min(0).max(10),
});

export type Review = z.infer<typeof ReviewSchema>;

export async function reviewCode(code: string): Promise<Review> {
  const { output } = await generateText({
    model,
    output: Output.object({ schema: ReviewSchema }),
    prompt: `Review this code and return structured feedback:\n\n${code}`,
  });
  return output;
}

// Smoke test when run directly
const { text } = await generateText({
  model,
  prompt: 'Say "AI SDK + OpenRouter + Zod ready!" in one sentence.',
});
console.log(text);
