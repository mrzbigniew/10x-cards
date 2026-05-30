import OpenAI from "openai";
import { OPENROUTER_API_KEY } from "astro:env/server";
import { ProposalSchema } from "@/lib/schemas/generation";
import { z } from "zod";

const MODEL = "openai/gpt-4o-mini";

const SYSTEM_PROMPT = `You are a flashcard expert. Given source text, generate educational flashcards covering the key facts, definitions, and concepts.

Rules:
- Generate between 5 and 15 flashcards
- Each flashcard has a "front" (a question or prompt) and a "back" (the answer or explanation)
- Focus on the most important, exam-worthy information
- Avoid trivial, redundant, or overly obvious cards
- The language of the flashcards MUST match the language of the source text

Respond ONLY with a JSON array of objects. Do not include any prose, explanation, or markdown fences.
Example format: [{"front": "What is photosynthesis?", "back": "The process by which plants convert sunlight and CO2 into glucose and oxygen"}]`;

export class GenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationError";
  }
}

export async function generateProposals(text: string): Promise<{ front: string; back: string }[]> {
  if (!OPENROUTER_API_KEY) {
    throw new GenerationError("AI generation is not configured. OPENROUTER_API_KEY is missing.");
  }

  // OPENROUTER_API_KEY narrowed to string above; eslint-disable needed because
  // astro:env/server virtual module types are not resolved by the ESLint type checker.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const apiKey: string = OPENROUTER_API_KEY;

  const client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
  });

  let content: string;
  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    });
    content = response.choices[0]?.message?.content ?? "";
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error from AI provider";
    throw new GenerationError(`AI request failed: ${message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new GenerationError("AI returned malformed JSON. Please try again.");
  }

  const result = z.array(ProposalSchema).safeParse(parsed);
  if (!result.success) {
    throw new GenerationError("AI response did not match expected format. Please try again.");
  }

  if (result.data.length === 0) {
    throw new GenerationError("AI returned no flashcard proposals. Try with a longer or more detailed text.");
  }

  return result.data;
}
