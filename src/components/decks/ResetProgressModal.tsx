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
    <div
      data-testid="modal-reset-progress"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div className="border-border bg-card w-full max-w-md rounded-2xl border p-6 shadow-xl">
        <h2 className="text-foreground mb-2 text-lg font-semibold">Resetuj postępy</h2>
        <p className="text-muted-foreground mb-4 text-sm">
          Zresetować postępy dla {cardCount} {cardCount === 1 ? "fiszki" : "fiszek"} w zestawie{" "}
          <span className="text-foreground font-semibold">{deckName}</span>? Nie można cofnąć.
        </p>
        {error && <p className="text-destructive mb-3 text-sm">{error}</p>}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isResetting}
            className="border-border bg-card text-foreground hover:bg-accent flex-1 rounded-lg border px-4 py-2 text-sm transition-colors disabled:opacity-40"
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
