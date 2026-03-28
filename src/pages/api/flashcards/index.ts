import type { APIRoute } from 'astro';

import { jsonError, jsonSuccess } from '../../../lib/api.helpers';
import * as FlashcardsService from '../../../lib/services/flashcards.service';
import { bulkFlashcardsSchema, listQuerySchema } from '../../../lib/validators/flashcards.validators';
import type { BulkFlashcardsCreateResponse, FlashcardsListResponse } from '../../../types';

export const prerender = false;

// ---------------------------------------------------------------------------
// GET /api/flashcards — paginated list
// ---------------------------------------------------------------------------

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const rawParams = Object.fromEntries(url.searchParams.entries());

  const parseResult = listQuerySchema.safeParse(rawParams);
  if (!parseResult.success) {
    return jsonError('INVALID_QUERY_PARAMS', 'Invalid query parameters', 400, {
      errors: parseResult.error.flatten().fieldErrors,
    });
  }

  const { limit, offset, source } = parseResult.data;

  try {
    const result = await FlashcardsService.listFlashcards(locals.supabase, { limit, offset, source });

    const responseBody: FlashcardsListResponse = {
      data: result.data,
      meta: result.meta,
    };

    return jsonSuccess(responseBody);
  } catch {
    return jsonError('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
};

// ---------------------------------------------------------------------------
// POST /api/flashcards — bulk create
// ---------------------------------------------------------------------------

export const POST: APIRoute = async ({ request, locals }) => {
  const userId = import.meta.env.DEFAULT_USER_ID;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonError('VALIDATION_ERROR', 'Request body must be valid JSON', 422);
  }

  const parseResult = bulkFlashcardsSchema.safeParse(rawBody);
  if (!parseResult.success) {
    const zodErrors = parseResult.error.errors;

    const tooMany = zodErrors.some((e) => e.path[0] === 'flashcards' && e.code === 'too_big');
    if (tooMany) {
      return jsonError('TOO_MANY_FLASHCARDS', 'flashcards array must not exceed 100 items', 400);
    }

    const details = zodErrors.map((e) => ({
      index: typeof e.path[1] === 'number' ? e.path[1] : undefined,
      field: e.path.slice(2).join('.') || e.path[e.path.length - 1],
      message: e.message,
    }));

    return jsonError('VALIDATION_ERROR', 'One or more flashcards failed validation', 422, {
      errors: details,
    });
  }

  const { flashcards } = parseResult.data;

  try {
    const created = await FlashcardsService.createFlashcards(
      locals.supabase,
      flashcards.map((fc) => ({
        front: fc.front,
        back: fc.back,
        source: fc.source,
        generationId: fc.generationId,
      })),
      userId
    );

    const responseBody: BulkFlashcardsCreateResponse = { data: created };

    return jsonSuccess(responseBody, 201);
  } catch {
    return jsonError('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
};
