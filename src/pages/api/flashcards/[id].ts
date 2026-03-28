import type { APIRoute } from 'astro';

import { jsonError, jsonSuccess } from '../../../lib/api.helpers';
import * as FlashcardsService from '../../../lib/services/flashcards.service';
import { flashcardUpdateSchema, uuidParamSchema } from '../../../lib/validators/flashcards.validators';

export const prerender = false;

// ---------------------------------------------------------------------------
// GET /api/flashcards/:id
// ---------------------------------------------------------------------------

export const GET: APIRoute = async ({ params, locals }) => {
  const idParse = uuidParamSchema.safeParse(params.id);
  if (!idParse.success) {
    return jsonError('INVALID_ID', 'id must be a valid UUID', 400);
  }

  try {
    const flashcard = await FlashcardsService.getFlashcard(locals.supabase, idParse.data);

    if (!flashcard) {
      return jsonError('FLASHCARD_NOT_FOUND', 'Flashcard not found', 404);
    }

    return jsonSuccess(flashcard);
  } catch {
    return jsonError('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
};

// ---------------------------------------------------------------------------
// PUT /api/flashcards/:id
// ---------------------------------------------------------------------------

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const idParse = uuidParamSchema.safeParse(params.id);
  if (!idParse.success) {
    return jsonError('INVALID_ID', 'id must be a valid UUID', 400);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonError('VALIDATION_ERROR', 'Request body must be valid JSON', 422);
  }

  const bodyParse = flashcardUpdateSchema.safeParse(rawBody);
  if (!bodyParse.success) {
    const details = bodyParse.error.flatten().fieldErrors;
    return jsonError('VALIDATION_ERROR', 'Validation failed', 422, details as Record<string, unknown>);
  }

  try {
    const updated = await FlashcardsService.updateFlashcard(locals.supabase, idParse.data, bodyParse.data);

    if (!updated) {
      return jsonError('FLASHCARD_NOT_FOUND', 'Flashcard not found', 404);
    }

    return jsonSuccess(updated);
  } catch {
    return jsonError('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
};

// ---------------------------------------------------------------------------
// DELETE /api/flashcards/:id
// ---------------------------------------------------------------------------

export const DELETE: APIRoute = async ({ params, locals }) => {
  const idParse = uuidParamSchema.safeParse(params.id);
  if (!idParse.success) {
    return jsonError('INVALID_ID', 'id must be a valid UUID', 400);
  }

  try {
    const deleted = await FlashcardsService.deleteFlashcard(locals.supabase, idParse.data);

    if (!deleted) {
      return jsonError('FLASHCARD_NOT_FOUND', 'Flashcard not found', 404);
    }

    return new Response(null, { status: 204 });
  } catch {
    return jsonError('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
};
