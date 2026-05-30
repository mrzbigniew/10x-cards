import type { createClient } from "@/lib/supabase";

type SupabaseClientType = NonNullable<ReturnType<typeof createClient>>;

export interface DeckWithCount {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  card_count: number;
}

export async function createDeckWithCards(
  supabase: SupabaseClientType,
  userId: string,
  name: string,
  cards: { front: string; back: string }[],
): Promise<{ deckId: string }> {
  const { data: deck, error: deckError } = await supabase
    .from("decks")
    .insert({ name, user_id: userId })
    .select("id")
    .single();

  if (deckError) {
    throw new Error(deckError.message);
  }

  if (cards.length > 0) {
    const { error: cardsError } = await supabase.from("cards").insert(
      cards.map((card) => ({
        front: card.front,
        back: card.back,
        source: "ai" as const,
        deck_id: deck.id,
        user_id: userId,
      })),
    );

    if (cardsError) {
      throw new Error(cardsError.message);
    }
  }

  return { deckId: deck.id };
}

export async function listDecksWithCardCount(supabase: SupabaseClientType, userId: string): Promise<DeckWithCount[]> {
  const { data, error } = await supabase
    .from("decks")
    .select("id, name, created_at, updated_at, cards(count)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    created_at: row.created_at,
    updated_at: row.updated_at,
    card_count: Array.isArray(row.cards) && row.cards.length > 0 ? row.cards[0].count : 0,
  }));
}

export async function createEmptyDeck(
  supabase: SupabaseClientType,
  userId: string,
  name: string,
): Promise<{ id: string }> {
  const { data, error } = await supabase.from("decks").insert({ name, user_id: userId }).select("id").single();

  if (error) {
    throw new Error(error.message);
  }

  return { id: data.id };
}

export async function renameDeck(
  supabase: SupabaseClientType,
  userId: string,
  deckId: string,
  name: string,
): Promise<void> {
  const { error } = await supabase
    .from("decks")
    .update({ name })
    .eq("id", deckId)
    .eq("user_id", userId)
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteDeck(supabase: SupabaseClientType, userId: string, deckId: string): Promise<void> {
  const { error } = await supabase.from("decks").delete().eq("id", deckId).eq("user_id", userId).select("id").single();

  if (error) {
    throw new Error(error.message);
  }
}

export async function appendCardsToDeck(
  supabase: SupabaseClientType,
  userId: string,
  deckId: string,
  cards: { front: string; back: string }[],
): Promise<void> {
  const { error: deckError } = await supabase
    .from("decks")
    .select("id")
    .eq("id", deckId)
    .eq("user_id", userId)
    .single();

  if (deckError) {
    throw new Error("Deck not found or access denied");
  }

  if (cards.length === 0) return;

  const { error } = await supabase.from("cards").insert(
    cards.map((c) => ({
      front: c.front,
      back: c.back,
      source: "ai" as const,
      deck_id: deckId,
      user_id: userId,
    })),
  );

  if (error) {
    throw new Error(error.message);
  }
}
