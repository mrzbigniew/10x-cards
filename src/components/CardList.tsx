import type { Card } from "@/components/hooks/useDeckDetail";
import { CardRow } from "@/components/CardRow";

interface Props {
  cards: Card[];
  onUpdate: (cardId: string, front: string, back: string, resetSR: boolean) => Promise<void>;
  onDelete: (cardId: string) => Promise<void>;
}

export function CardList({ cards, onUpdate, onDelete }: Props) {
  if (cards.length === 0) {
    return <p className="text-sm text-muted-foreground">Brak fiszek — dodaj pierwszą fiszkę.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {cards.map((card) => (
        <CardRow key={card.id} card={card} onUpdate={onUpdate} onDelete={onDelete} />
      ))}
    </ul>
  );
}
