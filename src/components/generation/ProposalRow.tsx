import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Proposal } from "@/components/hooks/useGeneration";

interface Props {
  proposal: Proposal;
  onUpdate: (id: string, patch: Partial<Proposal>) => void;
}

export function ProposalRow({ proposal, onUpdate }: Props) {
  const [editFront, setEditFront] = useState(proposal.editedFront ?? proposal.front);
  const [editBack, setEditBack] = useState(proposal.editedBack ?? proposal.back);
  const [prevStatus] = useState(proposal.status);

  const isEditing = proposal.status === "editing";
  const isAccepted = proposal.status === "accepted";
  const isRejected = proposal.status === "rejected";

  function handleEdit() {
    setEditFront(proposal.editedFront ?? proposal.front);
    setEditBack(proposal.editedBack ?? proposal.back);
    onUpdate(proposal.id, { status: "editing" });
  }

  function handleConfirmEdit() {
    if (!editFront.trim() || !editBack.trim()) return;
    onUpdate(proposal.id, { status: "accepted", editedFront: editFront.trim(), editedBack: editBack.trim() });
  }

  function handleCancelEdit() {
    onUpdate(proposal.id, { status: prevStatus === "editing" ? "pending" : prevStatus });
  }

  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition-colors",
        isAccepted && "border-green-500/40 bg-green-500/10",
        isRejected && "border-border bg-card opacity-50",
        !isAccepted && !isRejected && "border-border bg-card",
      )}
    >
      {isEditing ? (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Pytanie (przód)</label>
            <textarea
              className="w-full rounded border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
              rows={2}
              value={editFront}
              onChange={(e) => setEditFront(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Odpowiedź (tył)</label>
            <textarea
              className="w-full rounded border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
              rows={2}
              value={editBack}
              onChange={(e) => setEditBack(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleConfirmEdit}
              disabled={!editFront.trim() || !editBack.trim()}
              className="rounded bg-green-600/80 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-40"
            >
              Potwierdź
            </button>
            <button
              onClick={handleCancelEdit}
              className="rounded border border-border px-3 py-1 text-xs text-foreground/70 transition-colors hover:text-foreground"
            >
              Anuluj
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <p className={cn("text-sm font-medium text-foreground", isRejected && "line-through")}>
              {proposal.editedFront ?? proposal.front}
            </p>
            <p className={cn("text-sm text-muted-foreground", isRejected && "line-through")}>
              {proposal.editedBack ?? proposal.back}
            </p>
          </div>
          {!isRejected && (
            <div className="flex shrink-0 gap-1.5">
              {!isAccepted && (
                <button
                  onClick={() => onUpdate(proposal.id, { status: "accepted" })}
                  className="rounded bg-green-600/70 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-green-500"
                >
                  Akceptuj
                </button>
              )}
              <button
                onClick={handleEdit}
                className="rounded border border-border px-2.5 py-1 text-xs text-foreground/70 transition-colors hover:text-foreground"
              >
                Edytuj
              </button>
              <button
                onClick={() => onUpdate(proposal.id, { status: "rejected" })}
                className="rounded border border-destructive/30 px-2.5 py-1 text-xs text-destructive/80 transition-colors hover:border-destructive hover:text-destructive"
              >
                Odrzuć
              </button>
            </div>
          )}
          {isRejected && (
            <button
              onClick={() => onUpdate(proposal.id, { status: "pending" })}
              className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Cofnij
            </button>
          )}
        </div>
      )}
    </div>
  );
}
