import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { useDeckList } from "@/components/hooks/useDeckList";
import type { DeckWithCount } from "@/components/hooks/useDeckList";
import { DeckCard } from "@/components/decks/DeckRow";
import { DeleteDeckModal } from "@/components/decks/DeleteDeckModal";
import { CreateDeckModal } from "@/components/decks/CreateDeckModal";
import { ResetProgressModal } from "@/components/decks/ResetProgressModal";
import { GenerationModal } from "@/components/generation/GenerationModal";
import { ReviewModal } from "@/components/review/ReviewModal";

export function DeckList() {
  const { decks, loading, error, createDeck, deleteDeck, resetDeckProgress, refresh } = useDeckList();

  const [generatingDeck, setGeneratingDeck] = useState<DeckWithCount | null>(null);
  const [reviewingDeck, setReviewingDeck] = useState<DeckWithCount | null>(null);
  const [zeroDueToast, setZeroDueToast] = useState(false);

  useEffect(() => {
    if (!zeroDueToast) return;
    const timer = setTimeout(() => {
      setZeroDueToast(false);
    }, 3000);
    return () => {
      clearTimeout(timer);
    };
  }, [zeroDueToast]);

  useEffect(() => {
    function handleDeckSaved() {
      refresh();
    }
    window.addEventListener("deck-saved", handleDeckSaved);
    return () => {
      window.removeEventListener("deck-saved", handleDeckSaved);
    };
  }, [refresh]);

  useEffect(() => {
    function handleSessionCompleted() {
      refresh();
    }
    window.addEventListener("session-completed", handleSessionCompleted);
    return () => {
      window.removeEventListener("session-completed", handleSessionCompleted);
    };
  }, [refresh]);

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

  async function handleReviewRequest(deck: DeckWithCount) {
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const res = await fetch(`/api/decks/${deck.id}/review?due_before=${encodeURIComponent(endOfDay.toISOString())}`);
    if (!res.ok) return;
    const data = (await res.json()) as { cards: unknown[] };
    if (data.cards.length === 0) {
      setZeroDueToast(true);
    } else {
      setReviewingDeck(deck);
    }
  }

  const zeroDueToastEl =
    zeroDueToast && typeof document !== "undefined"
      ? createPortal(
          <div className="fixed right-6 bottom-6 z-[60] flex items-center gap-3 rounded-xl border border-yellow-500/30 bg-yellow-600/20 px-4 py-3 shadow-lg backdrop-blur-sm">
            <p className="text-sm font-semibold text-yellow-400">Brak kart na dziś</p>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="mt-8 w-full max-w-5xl">
      <div className="mb-4">
        <h2 className="text-foreground/80 text-base font-semibold">Twoje zestawy</h2>
      </div>

      {loading && <p className="text-muted-foreground text-sm">Ładowanie zestawów…</p>}
      {error && <p className="text-destructive text-sm">{error}</p>}

      {!loading && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-4">
          <button
            onClick={() => {
              setShowCreateForm(true);
              setCreateError(null);
            }}
            className="border-foreground/20 bg-card/30 hover:border-primary/50 hover:bg-card/60 relative flex min-h-[150px] w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors"
          >
            <Plus className="text-muted-foreground size-8" />
            <span className="text-muted-foreground mt-2 text-sm">Nowy zestaw</span>
          </button>
          {decks.map((deck) => (
            <DeckCard
              key={deck.id}
              deck={deck}
              onDeleteRequest={setDeletingDeck}
              onResetProgressRequest={setResettingDeck}
              onGenerateRequest={setGeneratingDeck}
              onReviewRequest={(d) => void handleReviewRequest(d)}
            />
          ))}
        </div>
      )}

      <CreateDeckModal
        isOpen={showCreateForm}
        onConfirm={(name) => void handleCreate(name)}
        onCancel={() => {
          setShowCreateForm(false);
          setCreateError(null);
        }}
        isCreating={creating}
        error={createError}
      />

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

      <ResetProgressModal
        isOpen={resettingDeck !== null}
        deckName={resettingDeck?.name ?? ""}
        cardCount={resettingDeck?.card_count ?? 0}
        onConfirm={() => void handleReset()}
        onCancel={() => {
          setResettingDeck(null);
          setResetError(null);
        }}
        isResetting={isResetting}
        error={resetError}
      />

      <GenerationModal
        isOpen={generatingDeck !== null}
        onClose={() => {
          setGeneratingDeck(null);
        }}
        preselectedDeckId={generatingDeck?.id}
      />

      {reviewingDeck && (
        <ReviewModal
          deckId={reviewingDeck.id}
          onClose={() => {
            setReviewingDeck(null);
          }}
        />
      )}

      {zeroDueToastEl}
    </div>
  );
}
