import type { Database, Tables, TablesInsert } from './db/database.types.ts';

// Re-export core DB types for convenience across the app
export type { Database, Tables, TablesInsert, TablesUpdate } from './db/database.types.ts';

// ======================
// Enums & Base Types
// ======================

/**
 * Source type for flashcards, directly from DB enum.
 * Used in both DB models and API DTOs.
 */
export type SourceType = Database['public']['Enums']['source_type'];

/**
 * Base Flashcard entity derived from DB table.
 * Includes all fields as they appear in the database.
 */
export type FlashcardEntity = Tables<'flashcards'>;

/**
 * AI Generation Log entity derived from DB table.
 */
export type AIGenerationLogEntity = Tables<'ai_generation_logs'>;

/**
 * AI Generation Stats from the DB view (read-only aggregation).
 */
export type AIGenerationStatsEntity = Database['public']['Views']['ai_generation_stats']['Row'];

// ======================
// API Response Wrappers
// ======================

/**
 * Standard success response wrapper used by most endpoints.
 */
export type ApiResponse<T = unknown> = {
  data: T;
};

/**
 * Paginated/list response wrapper.
 */
export type ApiListResponse<T = unknown> = {
  data: T[];
  meta?: {
    limit: number;
    offset: number;
  };
};

/**
 * Standardized error response.
 */
export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

// ======================
// Flashcard DTOs & Commands
// ======================

/**
 * Flashcard DTO for API responses.
 * Uses camelCase for frontend/JSON compatibility.
 * Derived from FlashcardEntity using type transformation.
 */
export type FlashcardDTO = {
  id: string;
  front: string;
  back: string;
  source: SourceType;
  generationId: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Command for creating a single flashcard (used in bulk create).
 * Omits DB-managed fields (id, timestamps, user_id).
 * Directly maps to Insert type but with stricter validation in API layer.
 */
export type FlashcardCreateCommand = Pick<
  TablesInsert<'flashcards'>,
  'front' | 'back' | 'source' | 'generation_id'
>;

/**
 * Bulk create command for POST /api/flashcards.
 * Matches the request body structure in the API plan.
 */
export type BulkFlashcardsCommand = {
  flashcards: FlashcardCreateCommand[];
};

/**
 * Command for updating a flashcard (PUT /api/flashcards/{id}).
 * Only front/back are updatable; source may be mutated by business logic (AI -> AI_EDIT).
 */
export type FlashcardUpdateCommand = {
  front: string;
  back: string;
};

/**
 * Flashcard response shape (single item).
 */
export type FlashcardResponse = ApiResponse<FlashcardDTO>;

/**
 * Flashcards list response (with pagination meta).
 */
export type FlashcardsListResponse = ApiListResponse<FlashcardDTO>;

// ======================
// AI Generation DTOs & Commands
// ======================

/**
 * Command for generating AI flashcards (POST /api/generate).
 * Input text is validated for length 1000-10000 chars.
 */
export type GenerateCommand = {
  text: string;
  model?: string;
};

/**
 * Candidate flashcard returned from AI generation (before acceptance).
 * Simple structure without IDs or metadata.
 */
export type CandidateFlashcard = {
  front: string;
  back: string;
};

/**
 * Response from AI generation endpoint.
 * Includes generationId for later acceptance tracking.
 */
export type AIGenerationResponse = {
  generationId: string;
  candidates: CandidateFlashcard[];
};

/**
 * AI Generation Stats DTO (camelCase for API responses).
 * Derived from the ai_generation_stats DB view.
 */
export type AIGenerationStatsDTO = {
  totalGenerations: number | null;
  totalAcceptedCards: number | null;
  acceptanceRatePercent: number | null;
};

// ======================
// Auth Command Models
// ======================

/**
 * Register command (POST /api/auth/register).
 */
export type RegisterCommand = {
  email: string;
  password: string;
  confirmPassword: string;
};

/**
 * Verify email command.
 */
export type VerifyEmailCommand = {
  email: string;
  token: string;
};

/**
 * Login command.
 */
export type LoginCommand = {
  email: string;
  password: string;
};

/**
 * Request password reset command.
 */
export type ResetPasswordRequestCommand = {
  email: string;
};

/**
 * Confirm password reset command.
 */
export type ResetPasswordConfirmCommand = {
  email: string;
  token: string;
  password: string;
  confirmPassword: string;
};

/**
 * Change password command (authenticated).
 */
export type ChangePasswordCommand = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

// ======================
// Utility Type Helpers
// ======================

/**
 * Helper to convert snake_case DB fields to camelCase for DTOs.
 * (Used manually in type definitions above for clarity).
 */
export type ToCamelCase<S extends string> = S extends `${infer P}_${infer R}`
  ? `${P}${Capitalize<ToCamelCase<R>>}`
  : S;

/**
 * Example of how a full DB row could be transformed to DTO.
 * Not used directly but documents the pattern.
 */
export type DBToDTO<T> = {
  [K in keyof T as ToCamelCase<K & string>]: T[K];
};
