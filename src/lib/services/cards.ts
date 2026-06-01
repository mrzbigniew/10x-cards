import type { createClient } from "@/lib/supabase";

type SupabaseClientType = NonNullable<ReturnType<typeof createClient>>;

export interface Card {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  source: string;
  created_at: string;
  updated_at: string;
}

export async function listCardsInDeck(supabase: SupabaseClientType, userId: string, deckId: string): Promise<Card[]> {
  const { data, error } = await supabase
    .from("cards")
    .select("id, deck_id, front, back, source, created_at, updated_at")
    .eq("deck_id", deckId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function addCard(
  supabase: SupabaseClientType,
  userId: string,
  deckId: string,
  front: string,
  back: string,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("cards")
    .insert({ deck_id: deckId, user_id: userId, front, back, source: "manual" as const })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return { id: data.id };
}

export async function resetCardSRState(supabase: SupabaseClientType, userId: string, cardId: string): Promise<void> {
  const { error } = await supabase
    .from("card_sr_state")
    .update({
      state: 0,
      due: new Date().toISOString(),
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 0,
      lapses: 0,
      last_review: null,
    })
    .eq("card_id", cardId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function updateCard(
  supabase: SupabaseClientType,
  userId: string,
  cardId: string,
  front: string,
  back: string,
  resetSR: boolean,
): Promise<void> {
  const { error } = await supabase.from("cards").update({ front, back }).eq("id", cardId).eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  if (resetSR) {
    await resetCardSRState(supabase, userId, cardId);
  }
}

export async function deleteCard(supabase: SupabaseClientType, userId: string, cardId: string): Promise<void> {
  const { error } = await supabase.from("cards").delete().eq("id", cardId).eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }
}
