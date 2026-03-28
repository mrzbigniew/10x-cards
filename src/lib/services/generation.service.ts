import { createHash } from 'crypto';

import type { CandidateFlashcard } from '../../types';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const AI_TIMEOUT_MS = 30000;

/**
 * System prompt instructs the model to return only a JSON array of {front, back} objects.
 * Kept separate from user content to prevent prompt injection.
 */
const SYSTEM_PROMPT = `You are a flashcard generator. Your task is to read a given text and extract key concepts to create study flashcards.

Rules:
- Return ONLY a valid JSON array. No other text, no markdown fences, no explanations.
- Each element must have exactly two fields: "front" (a question or concept, max 200 characters) and "back" (an answer or explanation, max 500 characters).
- If no meaningful flashcards can be extracted, return an empty array: []

Example output format:
[{"front":"What is photosynthesis?","back":"The process by which plants convert sunlight, water, and CO2 into glucose and oxygen."}]`;

// ---------------------------------------------------------------------------
// Custom error types
// ---------------------------------------------------------------------------

export class AIProviderError extends Error {
  readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'AIProviderError';
    this.statusCode = statusCode;
  }
}

export class AIParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIParseError';
  }
}

export class AITimeoutError extends Error {
  constructor() {
    super('OpenRouter request timed out after 30 seconds');
    this.name = 'AITimeoutError';
  }
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

function isValidCandidates(data: unknown): data is CandidateFlashcard[] {
  if (!Array.isArray(data)) return false;
  return data.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Record<string, unknown>).front === 'string' &&
      typeof (item as Record<string, unknown>).back === 'string'
  );
}

// ---------------------------------------------------------------------------
// OpenRouter call
// ---------------------------------------------------------------------------

/**
 * Calls OpenRouter API with the given text and returns parsed candidate flashcards.
 * Throws AITimeoutError, AIProviderError, or AIParseError on failure.
 */
export async function callOpenRouter(
  text: string,
  model: string,
  apiKey: string
): Promise<CandidateFlashcard[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new AITimeoutError();
    }
    throw new AIProviderError(
      `Network error while contacting OpenRouter: ${err instanceof Error ? err.message : 'unknown error'}`
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new AIProviderError(
      `OpenRouter returned HTTP ${response.status}`,
      response.status
    );
  }

  let responseJson: unknown;
  try {
    responseJson = await response.json();
  } catch {
    throw new AIParseError('Failed to parse OpenRouter HTTP response body as JSON');
  }

  // Extract text content from the OpenAI-compatible chat completion response
  const content = (
    responseJson as { choices?: Array<{ message?: { content?: string } }> }
  )?.choices?.[0]?.message?.content;

  if (typeof content !== 'string') {
    throw new AIParseError('OpenRouter response is missing expected choices[0].message.content field');
  }

  let candidates: unknown;
  try {
    candidates = JSON.parse(content);
  } catch {
    throw new AIParseError('AI response content is not valid JSON');
  }

  if (!isValidCandidates(candidates)) {
    throw new AIParseError(
      'AI response does not match the expected [{front: string, back: string}] structure'
    );
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Computes an MD5 hex digest of the given text using Node.js crypto module.
 * Used to store a privacy-preserving hash of the prompt in ai_generation_logs.
 */
export function computeTextHash(text: string): string {
  return createHash('md5').update(text, 'utf8').digest('hex');
}
