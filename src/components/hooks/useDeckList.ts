import { useState, useCallback, useEffect } from "react";
import type { DeckWithCount } from "@/lib/services/decks";

export type { DeckWithCount };

export function useDeckList() {
  const [decks, setDecks] = useState<DeckWithCount[]>([]);
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
        const res = await fetch("/api/decks");
        if (!res.ok) {
          const d = (await res.json()) as { error?: string };
          throw new Error(d.error ?? "Failed to load decks");
        }
        const data = (await res.json()) as DeckWithCount[];
        if (!cancelled) setDecks(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load decks");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const createDeck = useCallback(
    async (name: string) => {
      const res = await fetch("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, cards: [] }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to create deck");
      }
      refresh();
    },
    [refresh],
  );

  const deleteDeck = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/decks/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to delete deck");
      }
      refresh();
    },
    [refresh],
  );

  const resetDeckProgress = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/decks/${id}/reset-progress`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to reset deck progress");
      }
      refresh();
    },
    [refresh],
  );

  return { decks, loading, error, createDeck, deleteDeck, resetDeckProgress, refresh };
}
