import { useState } from "react";
import { useDeckList } from "@/components/hooks/useDeckList";
import type { DeckWithCount } from "@/components/hooks/useDeckList";
import { DeckCard } from "@/components/decks/DeckRow";
import { DeleteDeckModal } from "@/components/decks/DeleteDeckModal";

export function DeckList() {
  const { decks, loading, error, createDeck, deleteDeck } = useDeckList();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newDeckName, setNewDeckName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [deletingDeck, setDeletingDeck] = useState<DeckWithCount | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleCreate(e: React.SyntheticEvent) {
    e.preventDefault();
    const name = newDeckName.trim();
    if (!name) return;
    setCreating(true);
    setCreateError(null);
    try {
      await createDeck(name);
      setNewDeckName("");
      setShowCreateForm(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Nie udało się utworzyć zestawu");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!deletingDeck) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteDeck(deletingDeck.id);
      setDeletingDeck(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Nie udało się usunąć zestawu");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="mt-8 w-full max-w-5xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground/80">Twoje zestawy</h2>
        {!showCreateForm && (
          <button
            onClick={() => {
              setShowCreateForm(true);
              setCreateError(null);
            }}
            className="rounded-lg border border-purple-500/40 bg-purple-600/20 px-3 py-1.5 text-xs font-medium text-purple-300 transition-colors hover:bg-purple-600/30"
          >
            + Nowy zestaw
          </button>
        )}
      </div>

      {showCreateForm && (
        <form onSubmit={(e) => void handleCreate(e)} className="mb-4 flex gap-2">
          <input
            type="text"
            value={newDeckName}
            onChange={(e) => {
              setNewDeckName(e.target.value);
            }}
            maxLength={200}
            autoFocus
            placeholder="Nazwa zestawu"
            className="flex-1 rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
          />
          <button
            type="submit"
            disabled={creating || !newDeckName.trim()}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-purple-500 disabled:opacity-40"
          >
            {creating ? "…" : "Utwórz"}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowCreateForm(false);
              setNewDeckName("");
              setCreateError(null);
            }}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent"
          >
            Anuluj
          </button>
        </form>
      )}

      {createError && <p className="mb-3 text-sm text-red-400">{createError}</p>}

      {loading && <p className="text-sm text-muted-foreground">Ładowanie zestawów…</p>}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && !error && decks.length === 0 && (
        <p className="text-sm text-muted-foreground">Nie masz jeszcze żadnych zestawów. Utwórz pierwszy!</p>
      )}

      {!loading && decks.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-4">
          {decks.map((deck) => (
            <DeckCard key={deck.id} deck={deck} onDeleteRequest={setDeletingDeck} />
          ))}
        </div>
      )}

      <DeleteDeckModal
        isOpen={deletingDeck !== null}
        deckName={deletingDeck?.name ?? ""}
        onConfirm={() => void handleDelete()}
        onCancel={() => {
          setDeletingDeck(null);
          setDeleteError(null);
        }}
        isDeleting={isDeleting}
        error={deleteError}
      />
    </div>
  );
}
