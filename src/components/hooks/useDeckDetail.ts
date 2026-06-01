import { useState, useCallback, useEffect } from "react";
import type { Card } from "@/lib/services/cards";

export type { Card };

export interface Deck {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export function useDeckDetail(deckId: string) {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/decks/${deckId}`);
        if (!res.ok) {
          const d = (await res.json()) as { error?: string };
          throw new Error(d.error ?? "Failed to load deck");
        }
        const data = (await res.json()) as { deck: Deck; cards: Card[] };
        if (!cancelled) {
          setDeck(data.deck);
          setCards(data.cards);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load deck");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [deckId, refreshKey]);

  const renameDeck = useCallback(
    async (name: string) => {
      const res = await fetch(`/api/decks/${deckId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to rename deck");
      }
      refresh();
    },
    [deckId, refresh],
  );

  const addCard = useCallback(
    async (front: string, back: string) => {
      const res = await fetch(`/api/decks/${deckId}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ front, back }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to add card");
      }
      refresh();
    },
    [deckId, refresh],
  );

  const updateCard = useCallback(
    async (cardId: string, front: string, back: string, resetSR: boolean) => {
      const res = await fetch(`/api/decks/${deckId}/cards/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ front, back, resetSR }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to update card");
      }
      refresh();
    },
    [deckId, refresh],
  );

  const deleteCard = useCallback(
    async (cardId: string) => {
      const res = await fetch(`/api/decks/${deckId}/cards/${cardId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to delete card");
      }
      refresh();
    },
    [deckId, refresh],
  );

  return { deck, cards, loading, error, renameDeck, addCard, updateCard, deleteCard };
}
