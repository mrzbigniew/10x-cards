import { useState } from "react";
import { useDeckDetail } from "@/components/hooks/useDeckDetail";
import { DeckDetailHeader } from "@/components/DeckDetailHeader";
import { CardList } from "@/components/CardList";
import { AddCardModal } from "@/components/AddCardModal";

interface Props {
  deckId: string;
}

export function DeckDetail({ deckId }: Props) {
  const { deck, cards, loading, error, renameDeck, addCard, updateCard, deleteCard } = useDeckDetail(deckId);
  const [showAddModal, setShowAddModal] = useState(false);

  if (loading) {
    return <p className="text-sm text-white/40">Loading…</p>;
  }

  if (error ?? !deck) {
    return <p className="text-sm text-red-400">{error ?? "Deck not found"}</p>;
  }

  return (
    <div>
      <DeckDetailHeader deck={deck} onRename={renameDeck} />
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-white/80">Cards</h2>
        <button
          onClick={() => {
            setShowAddModal(true);
          }}
          className="rounded-lg border border-purple-500/40 bg-purple-600/20 px-3 py-1.5 text-xs font-medium text-purple-300 transition-colors hover:bg-purple-600/30"
        >
          + Add card
        </button>
      </div>
      <CardList cards={cards} onUpdate={updateCard} onDelete={deleteCard} />
      <AddCardModal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
        }}
        onAdd={addCard}
      />
    </div>
  );
}
