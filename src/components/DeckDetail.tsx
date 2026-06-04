import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useDeckDetail } from "@/components/hooks/useDeckDetail";
import { DeckDetailHeader } from "@/components/DeckDetailHeader";
import { CardList } from "@/components/CardList";
import { AddCardModal } from "@/components/AddCardModal";
import { GenerationModal } from "@/components/generation/GenerationModal";

interface Props {
  deckId: string;
}

export function DeckDetail({ deckId }: Props) {
  const { deck, cards, loading, error, renameDeck, addCard, updateCard, deleteCard } = useDeckDetail(deckId);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showGenerationModal, setShowGenerationModal] = useState(false);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Ładowanie…</p>;
  }

  if (error ?? !deck) {
    return <p className="text-sm text-destructive">{error ?? "Nie znaleziono zestawu"}</p>;
  }

  return (
    <div>
      <DeckDetailHeader deck={deck} onRename={renameDeck} />
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground/80">Fiszki</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGenerationModal(true)}
            className="flex items-center gap-1.5 rounded-lg border border-purple-500/40 bg-purple-600/20 px-3 py-1.5 text-xs font-medium text-purple-600 transition-colors hover:bg-purple-600/30 dark:text-purple-300"
          >
            <Sparkles className="h-3 w-3" />
            Generuj z AI
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="rounded-lg border border-purple-500/40 bg-purple-600/20 px-3 py-1.5 text-xs font-medium text-purple-600 transition-colors hover:bg-purple-600/30 dark:text-purple-300"
          >
            + Dodaj fiszkę
          </button>
        </div>
      </div>
      <CardList cards={cards} onUpdate={updateCard} onDelete={deleteCard} />
      <AddCardModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={addCard}
      />
      <GenerationModal
        isOpen={showGenerationModal}
        onClose={() => setShowGenerationModal(false)}
        preselectedDeckId={deckId}
      />
    </div>
  );
}
