import { useState, useEffect } from "react";
import type { Proposal } from "@/components/hooks/useGeneration";
import type { DeckWithCount } from "@/lib/services/decks";

interface Props {
  text: string;
  proposals: Proposal[];
  isSaving: boolean;
  onSave: (target: { name: string } | { deckId: string }) => void;
  preselectedDeckId?: string;
}

export function SaveDeckForm({ text, proposals, isSaving, onSave, preselectedDeckId }: Props) {
  const autoName = text.trim().replace(/\s+/g, " ").slice(0, 50);
  const [decks, setDecks] = useState<DeckWithCount[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string>(preselectedDeckId ?? "new");
  const [newDeckName, setNewDeckName] = useState(autoName);
  const [confirmSkip, setConfirmSkip] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/decks")
      .then((res) => (res.ok ? (res.json() as Promise<DeckWithCount[]>) : Promise.resolve([])))
      .then((data) => {
        if (!cancelled) setDecks(data);
      })
      .catch(() => {
        /* silently fall back to new-deck-only */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const acceptedCount = proposals.filter((p) => p.status === "accepted").length;
  const pendingCount = proposals.filter((p) => p.status === "pending").length;

  function handleSave() {
    if (acceptedCount === 0) return;
    if (pendingCount > 0 && !confirmSkip) {
      setConfirmSkip(true);
      return;
    }
    if (selectedDeckId === "new") {
      onSave({ name: newDeckName.trim() || autoName });
    } else {
      onSave({ deckId: selectedDeckId });
    }
  }

  return (
    <div className="border-border bg-card rounded-xl border p-6">
      <h3 className="text-foreground mb-4 text-base font-semibold">Zapisz fiszki</h3>

      {!preselectedDeckId && (
        <div className="mb-4">
          <label className="text-foreground/70 mb-1.5 block text-sm font-medium">Zestaw</label>
          <select
            value={selectedDeckId}
            onChange={(e) => {
              setSelectedDeckId(e.target.value);
              setConfirmSkip(false);
            }}
            className="border-border bg-input text-foreground focus:border-primary/50 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
          >
            <option value="new">Nowy zestaw</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.card_count} fiszek)
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedDeckId === "new" && !preselectedDeckId && (
        <div className="mb-4">
          <label className="text-foreground/70 mb-1.5 block text-sm font-medium">Nazwa zestawu</label>
          <input
            type="text"
            value={newDeckName}
            onChange={(e) => {
              setNewDeckName(e.target.value);
              setConfirmSkip(false);
            }}
            maxLength={200}
            className="border-border bg-input text-foreground placeholder:text-muted-foreground focus:border-primary/50 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
            placeholder="Nazwa zestawu"
          />
        </div>
      )}

      <div className="text-muted-foreground mb-4 text-sm">
        {acceptedCount === 0 ? (
          <span className="text-amber-500">Zaakceptuj przynajmniej jedną propozycję, aby zapisać.</span>
        ) : (
          <span>
            Liczba fiszek do zapisania: <span className="text-foreground font-medium">{acceptedCount}</span>
          </span>
        )}
      </div>

      {confirmSkip && pendingCount > 0 && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-300">
          {pendingCount} nierozpatrzona propozycja{pendingCount === 1 ? "" : `(${pendingCount})`} zostanie pominięta.
          Kliknij &bdquo;Zapisz zestaw&rdquo; ponownie, aby potwierdzić.
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={isSaving || acceptedCount === 0}
        className="w-full rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isSaving ? "Zapisywanie…" : "Zapisz zestaw"}
      </button>
    </div>
  );
}
