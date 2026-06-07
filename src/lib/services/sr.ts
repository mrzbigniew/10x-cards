import { fsrs, type Card, type Grade, type ReviewLog } from "ts-fsrs";
import type { createClient } from "@/lib/supabase";
import type { Tables, TablesInsert } from "@/lib/database.types";

type SupabaseClientType = NonNullable<ReturnType<typeof createClient>>;
type CardSrRow = Tables<"card_sr_state">;

const scheduler = fsrs();

function rowToFsrsCard(row: CardSrRow): Card {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
    learning_steps: row.learning_steps,
  };
}

export function fsrsCardToDbUpdate(card: Card) {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review?.toISOString() ?? null,
    learning_steps: card.learning_steps,
  };
}

function reviewLogToDbInsert(log: ReviewLog, cardId: string, userId: string): TablesInsert<"review_logs"> {
  return {
    card_id: cardId,
    user_id: userId,
    rating: log.rating,
    state: log.state,
    due: log.due.toISOString(),
    stability: log.stability,
    difficulty: log.difficulty,
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    elapsed_days: log.elapsed_days,
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    last_elapsed_days: log.last_elapsed_days,
    scheduled_days: log.scheduled_days,
    learning_steps: log.learning_steps,
    review: log.review.toISOString(),
  };
}

export interface DueCard {
  id: string;
  front: string;
  back: string;
  sr: CardSrRow;
}

export type RatingResult = ReturnType<typeof fsrsCardToDbUpdate>;

export async function loadDueCards(
  supabase: SupabaseClientType,
  userId: string,
  deckId: string,
  dueBefore: string,
): Promise<DueCard[]> {
  const { data, error } = await supabase
    .from("card_sr_state")
    .select("*, cards!inner(id, front, back)")
    .eq("user_id", userId)
    .lte("due", dueBefore)
    // .eq on the embed acts as a JOIN condition — filters to this deck only (PostgREST embedded filter)
    .eq("cards.deck_id", deckId)
    .order("due");

  if (error) throw new Error(error.message);

  return data.map(({ cards, ...sr }) => ({
    id: cards.id,
    front: cards.front,
    back: cards.back,
    sr,
  }));
}

export async function applyRating(
  supabase: SupabaseClientType,
  userId: string,
  cardId: string,
  deckId: string,
  rating: Grade,
  now: Date,
): Promise<RatingResult> {
  // Load current SR state + verify card belongs to the given deck (defense-in-depth)
  const { data: srRow, error: loadError } = await supabase
    .from("card_sr_state")
    .select("*, cards!inner(deck_id)")
    .eq("card_id", cardId)
    .eq("user_id", userId)
    .eq("cards.deck_id", deckId)
    .single();

  if (loadError) throw new Error(loadError.message);

  const card = rowToFsrsCard(srRow);
  const result = scheduler.next(card, now, rating);

  const update = fsrsCardToDbUpdate(result.card);
  const { error: updateError } = await supabase
    .from("card_sr_state")
    .update(update)
    .eq("card_id", cardId)
    .eq("user_id", userId);

  if (updateError) throw new Error(updateError.message);

  // Best-effort: log insert failure is non-fatal — SR state is already persisted
  const { error: logError } = await supabase
    .from("review_logs")
    .insert(reviewLogToDbInsert(result.log, cardId, userId));
  if (logError) console.error("[review_logs] insert failed:", logError.message);

  return update;
}
