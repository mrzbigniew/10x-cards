import { z } from 'zod';

export const flashcardFieldsSchema = z.object({
  front: z.string().trim().min(1, 'front must not be empty').max(200, 'front must be at most 200 characters'),
  back: z.string().trim().min(1, 'back must not be empty').max(500, 'back must be at most 500 characters'),
});

export const flashcardCreateItemSchema = flashcardFieldsSchema
  .extend({
    source: z.enum(['MANUAL', 'AI', 'AI_EDIT']),
    generationId: z.string().uuid('generationId must be a valid UUID').nullable(),
  })
  .refine(
    (data) => (data.source === 'MANUAL' ? data.generationId === null : data.generationId !== null),
    { message: 'generationId must be null for MANUAL and a valid UUID for AI/AI_EDIT' }
  );

export const bulkFlashcardsSchema = z.object({
  flashcards: z
    .array(flashcardCreateItemSchema)
    .min(1, 'flashcards array must not be empty')
    .max(100, 'flashcards array must not exceed 100 items'),
});

export const flashcardUpdateSchema = flashcardFieldsSchema;

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  source: z.enum(['MANUAL', 'AI', 'AI_EDIT']).optional(),
});

export const uuidParamSchema = z.string().uuid('id must be a valid UUID');

export type ListQueryParams = z.infer<typeof listQuerySchema>;
export type FlashcardCreateItem = z.infer<typeof flashcardCreateItemSchema>;
export type BulkFlashcardsInput = z.infer<typeof bulkFlashcardsSchema>;
export type FlashcardUpdateInput = z.infer<typeof flashcardUpdateSchema>;
