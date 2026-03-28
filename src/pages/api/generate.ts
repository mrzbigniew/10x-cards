import type { APIRoute } from 'astro';

import { jsonError } from '../../lib/api.helpers';
import { GenerateSchema } from '../../lib/schemas/generate.schema';
import {
  AIParseError,
  AIProviderError,
  AITimeoutError,
  callOpenRouter,
  computeTextHash,
} from '../../lib/services/generation.service';
import type { Json } from '../../db/database.types';
import type { AIGenerationResponse, ApiResponse } from '../../types';

export const prerender = false;

const RATE_LIMIT_PER_HOUR = parseInt(import.meta.env.GENERATION_RATE_LIMIT_PER_HOUR ?? '10', 10);
const DEFAULT_MODEL = import.meta.env.DEFAULT_OPENROUTER_MODEL ?? 'openai/gpt-4o-mini';

// ---------------------------------------------------------------------------
// POST /api/generate
// ---------------------------------------------------------------------------

export const POST: APIRoute = async ({ request, locals }) => {
  const supabase = locals.supabase;

  // [1] Auth — placeholder: use DEFAULT_USER_ID from env
  const userId = import.meta.env.DEFAULT_USER_ID;

  // [2] Parse & validate request body
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonError('VALIDATION_ERROR', 'Request body must be valid JSON', 422);
  }

  const parseResult = GenerateSchema.safeParse(rawBody);
  if (!parseResult.success) {
    const details = parseResult.error.flatten().fieldErrors;
    return jsonError('VALIDATION_ERROR', 'Input validation failed', 422, details as Record<string, unknown>);
  }

  const { text } = parseResult.data;

  // [3] Rate limit check
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  const { count, error: countError } = await supabase
    .from('ai_generation_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', oneHourAgo);

  if (countError) {
    console.error('[generate] Rate limit check failed:', countError);
    return jsonError('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }

  if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return jsonError('RATE_LIMIT_EXCEEDED', 'Generation rate limit exceeded. Please try again later.', 429);
  }

  // [4] Prepare AI call
  const model = DEFAULT_MODEL;
  const apiKey = import.meta.env.OPENROUTER_API_KEY;
  const promptTextHash = computeTextHash(text);
  const promptTextLength = text.length;

  // [5] Call OpenRouter and measure duration
  const startTime = Date.now();
  let candidates: Awaited<ReturnType<typeof callOpenRouter>> = [];
  let aiErrorCode: string | null = null;
  let aiErrorMessage: string | null = null;

  try {
    candidates = await callOpenRouter(text, model, apiKey);
  } catch (err) {
    const duration = Date.now() - startTime;

    if (err instanceof AITimeoutError) {
      aiErrorCode = 'TIMEOUT';
      aiErrorMessage = err.message;
      await logGeneration(supabase, { userId, model, promptTextHash, promptTextLength, duration, generatedCount: 0, errorCode: aiErrorCode, errorMessage: aiErrorMessage });
      return jsonError('AI_PROVIDER_UNAVAILABLE', 'AI provider timed out. Please try again.', 503);
    }

    if (err instanceof AIParseError) {
      aiErrorCode = 'PARSE_ERROR';
      aiErrorMessage = err.message;
      await logGeneration(supabase, { userId, model, promptTextHash, promptTextLength, duration, generatedCount: 0, errorCode: aiErrorCode, errorMessage: aiErrorMessage });
      return jsonError('AI_PROVIDER_ERROR', 'AI response could not be parsed.', 502);
    }

    if (err instanceof AIProviderError) {
      aiErrorCode = 'PROVIDER_ERROR';
      aiErrorMessage = err.message;
      await logGeneration(supabase, { userId, model, promptTextHash, promptTextLength, duration, generatedCount: 0, errorCode: aiErrorCode, errorMessage: aiErrorMessage });
      return jsonError('AI_PROVIDER_ERROR', 'AI provider returned an error.', 502);
    }

    console.error('[generate] Unexpected error during AI call:', err);
    await logGeneration(supabase, { userId, model, promptTextHash, promptTextLength, duration, generatedCount: 0, errorCode: 'INTERNAL_ERROR', errorMessage: 'Unexpected error' });
    return jsonError('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }

  const duration = Date.now() - startTime;

  // [6] Log successful generation
  const generationId = await logGeneration(supabase, {
    userId,
    model,
    promptTextHash,
    promptTextLength,
    duration,
    generatedCount: candidates.length,
    rawCandidates: candidates as Json,
    errorCode: null,
    errorMessage: null,
  });

  if (!generationId) {
    return jsonError('INTERNAL_ERROR', 'Failed to persist generation log', 500);
  }

  // [7] Return success response
  const responseBody: ApiResponse<AIGenerationResponse> = {
    data: { generationId, candidates },
  };

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

// ---------------------------------------------------------------------------
// Helper: insert into ai_generation_logs, returns the generated row id or null
// ---------------------------------------------------------------------------

interface LogGenerationParams {
  userId: string;
  model: string;
  promptTextHash: string;
  promptTextLength: number;
  duration: number;
  generatedCount: number;
  rawCandidates?: Json | null;
  errorCode: string | null;
  errorMessage: string | null;
}

async function logGeneration(
  supabase: typeof import('../../db/supabase.client').supabaseClient,
  params: LogGenerationParams
): Promise<string | null> {
  const { data, error } = await supabase
    .from('ai_generation_logs')
    .insert({
      user_id: params.userId,
      model: params.model,
      prompt_text_hash: params.promptTextHash,
      prompt_text_length: params.promptTextLength,
      duration: params.duration,
      generated_count: params.generatedCount,
      raw_candidates: params.rawCandidates ?? null as Json | null,
      error_code: params.errorCode,
      error_message: params.errorMessage,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[generate] Failed to insert ai_generation_logs:', error);
    return null;
  }

  return data.id;
}
