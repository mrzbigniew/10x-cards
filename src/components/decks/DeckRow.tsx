import { Play, Trash2 } from "lucide-react";
import type { DeckWithCount } from "@/components/hooks/useDeckList";

interface Props {
  deck: DeckWithCount;
  onDeleteRequest: (deck: DeckWithCount) => void;
}

export function DeckCard({ deck, onDeleteRequest }: Props) {
  return (
    <div className="relative flex min-h-[150px] w-full flex-col justify-between rounded-xl border border-border bg-card p-4 backdrop-blur-sm transition-shadow hover:shadow-md">
      <a href={`/deck/${deck.id}`} className="absolute inset-0 z-0 rounded-xl" aria-label={deck.name} />

      <div className="pointer-events-none relative z-10">
        <p className="line-clamp-2 text-lg font-semibold text-foreground">{deck.name}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {deck.card_count} {deck.card_count === 1 ? "fiszka" : "fiszek"}
        </p>
      </div>

      <div className="relative z-10 flex items-center justify-end gap-1">
        <a
          href={`/deck/${deck.id}/review`}
          title="Powtórz"
          className="rounded-lg p-2 text-green-600 transition-colors hover:bg-green-500/10 hover:text-green-500"
        >
          <Play className="size-4" />
        </a>
        <button
          onClick={() => onDeleteRequest(deck)}
          title="Usuń"
          className="rounded-lg p-2 text-red-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}
