import { useState } from "react";
import { Plus } from "lucide-react";
import { useDeckList } from "@/components/hooks/useDeckList";
import type { DeckWithCount } from "@/components/hooks/useDeckList";
import { DeckCard } from "@/components/decks/DeckRow";
import { DeleteDeckModal } from "@/components/decks/DeleteDeckModal";
import { CreateDeckModal } from "@/components/decks/CreateDeckModal";
import { ResetProgressModal } from "@/components/decks/ResetProgressModal";

export function DeckList() {
  const { decks, loading, error, createDeck, deleteDeck, resetDeckProgress } = useDeckList();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [deletingDeck, setDeletingDeck] = useState<DeckWithCount | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [resettingDeck, setResettingDeck] = useState<DeckWithCount | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  async function handleCreate(name: string) {
    setCreating(true);
    setCreateError(null);
    try {
      await createDeck(name);
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

  async function handleReset() {
    if (!resettingDeck) return;
    setIsResetting(true);
    setResetError(null);
    try {
      await resetDeckProgress(resettingDeck.id);
      setResettingDeck(null);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Nie udało się zresetować postępów");
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <div className="mt-8 w-full max-w-5xl">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground/80">Twoje zestawy</h2>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Ładowanie zestawów…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-4">
          <button
            onClick={() => { setShowCreateForm(true); setCreateError(null); }}
            className="relative flex min-h-[150px] w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-foreground/20 bg-card/30 transition-colors hover:border-primary/50 hover:bg-card/60"
          >
            <Plus className="size-8 text-muted-foreground" />
            <span className="mt-2 text-sm text-muted-foreground">Nowy zestaw</span>
          </button>
          {decks.map((deck) => (
            <DeckCard key={deck.id} deck={deck} onDeleteRequest={setDeletingDeck} onResetProgressRequest={setResettingDeck} />
          ))}
        </div>
      )}

      <CreateDeckModal
        isOpen={showCreateForm}
        onConfirm={(name) => void handleCreate(name)}
        onCancel={() => { setShowCreateForm(false); setCreateError(null); }}
        isCreating={creating}
        error={createError}
      />

      <DeleteDeckModal
        isOpen={deletingDeck !== null}
        deckName={deletingDeck?.name ?? ""}
        onConfirm={() => void handleDelete()}
        onCancel={() => { setDeletingDeck(null); setDeleteError(null); }}
        isDeleting={isDeleting}
        error={deleteError}
      />

      <ResetProgressModal
        isOpen={resettingDeck !== null}
        deckName={resettingDeck?.name ?? ""}
        cardCount={resettingDeck?.card_count ?? 0}
        onConfirm={() => void handleReset()}
        onCancel={() => { setResettingDeck(null); setResetError(null); }}
        isResetting={isResetting}
        error={resetError}
      />
    </div>
  );
}
