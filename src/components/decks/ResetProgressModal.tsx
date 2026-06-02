import { cn } from "@/lib/utils";

interface Props {
  isOpen: boolean;
  deckName: string;
  cardCount: number;
  onConfirm: () => void;
  onCancel: () => void;
  isResetting: boolean;
  error?: string | null;
}

export function ResetProgressModal({ isOpen, deckName, cardCount, onConfirm, onCancel, isResetting, error }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <h2 className="mb-2 text-lg font-semibold text-foreground">Resetuj postępy</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Zresetować postępy dla {cardCount} {cardCount === 1 ? "fiszki" : "fiszek"} w zestawie{" "}
          <span className="font-semibold text-foreground">{deckName}</span>? Nie można cofnąć.
        </p>
        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isResetting}
            className="flex-1 rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-40"
          >
            Anuluj
          </button>
          <button
            onClick={onConfirm}
            disabled={isResetting}
            className={cn(
              "flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors",
              !isResetting ? "bg-red-600 hover:bg-red-500" : "cursor-not-allowed bg-red-600/40 opacity-40",
            )}
          >
            {isResetting ? "Resetowanie…" : "Resetuj postępy"}
          </button>
        </div>
      </div>
    </div>
  );
}
