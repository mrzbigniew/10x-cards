import type { supabaseClient } from '../../db/supabase.client';
import type { FlashcardCreateCommand, FlashcardDTO, FlashcardUpdateCommand } from '../../types';
import type { SourceType } from '../../types';

type SupabaseClient = typeof supabaseClient;

interface ListParams {
  limit: number;
  offset: number;
  source?: SourceType;
}

interface ListResult {
  data: FlashcardDTO[];
  meta: { limit: number; offset: number };
}

const FLASHCARD_COLUMNS = 'id, front, back, source, generation_id, created_at, updated_at';

function mapEntityToDTO(entity: {
  id: string;
  front: string;
  back: string;
  source: SourceType;
  generation_id: string | null;
  created_at: string;
  updated_at: string;
}): FlashcardDTO {
  return {
    id: entity.id,
    front: entity.front,
    back: entity.back,
    source: entity.source,
    generationId: entity.generation_id,
    createdAt: entity.created_at,
    updatedAt: entity.updated_at,
  };
}

export async function listFlashcards(
  supabase: SupabaseClient,
  params: ListParams
): Promise<ListResult> {
  const { limit, offset, source } = params;

  let query = supabase
    .from('flashcards')
    .select(FLASHCARD_COLUMNS)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (source) {
    query = query.eq('source', source);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[flashcards] listFlashcards DB error:', error);
    throw new Error('Failed to fetch flashcards');
  }

  return {
    data: (data ?? []).map((entity) => mapEntityToDTO(entity)),
    meta: { limit, offset },
  };
}

export async function createFlashcards(
  supabase: SupabaseClient,
  flashcards: FlashcardCreateCommand[],
  userId: string
): Promise<FlashcardDTO[]> {
  const records = flashcards.map((fc) => ({
    front: fc.front.trim(),
    back: fc.back.trim(),
    source: fc.source,
    generation_id: fc.generationId ?? null,
    user_id: userId,
  }));

  const { data, error } = await supabase.from('flashcards').insert(records).select(FLASHCARD_COLUMNS);

  if (error) {
    console.error('[flashcards] createFlashcards DB error:', error);
    throw new Error('Failed to create flashcards');
  }

  return (data ?? []).map((entity) => mapEntityToDTO(entity));
}

export async function getFlashcard(supabase: SupabaseClient, id: string): Promise<FlashcardDTO | null> {
  const { data, error } = await supabase
    .from('flashcards')
    .select(FLASHCARD_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[flashcards] getFlashcard DB error:', error);
    throw new Error('Failed to fetch flashcard');
  }

  if (!data) return null;

  return mapEntityToDTO(data);
}

export async function updateFlashcard(
  supabase: SupabaseClient,
  id: string,
  command: FlashcardUpdateCommand
): Promise<FlashcardDTO | null> {
  // Fetch current source to determine mutation
  const { data: existing, error: fetchError } = await supabase
    .from('flashcards')
    .select('source')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) {
    console.error('[flashcards] updateFlashcard fetch error:', fetchError);
    throw new Error('Failed to fetch flashcard');
  }

  if (!existing) return null;

  const newSource: SourceType = existing.source === 'AI' ? 'AI_EDIT' : existing.source;

  const { data, error } = await supabase
    .from('flashcards')
    .update({ front: command.front.trim(), back: command.back.trim(), source: newSource })
    .eq('id', id)
    .select(FLASHCARD_COLUMNS)
    .single();

  if (error) {
    console.error('[flashcards] updateFlashcard update error:', error);
    throw new Error('Failed to update flashcard');
  }

  return mapEntityToDTO(data);
}

export async function deleteFlashcard(supabase: SupabaseClient, id: string): Promise<boolean> {
  const { error, count } = await supabase
    .from('flashcards')
    .delete({ count: 'exact' })
    .eq('id', id);

  if (error) {
    console.error('[flashcards] deleteFlashcard DB error:', error);
    throw new Error('Failed to delete flashcard');
  }

  return (count ?? 0) > 0;
}
