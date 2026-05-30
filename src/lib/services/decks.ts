import type { createClient } from "@/lib/supabase";

type SupabaseClientType = NonNullable<ReturnType<typeof createClient>>;

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

  return { deckId: deck.id };
}
