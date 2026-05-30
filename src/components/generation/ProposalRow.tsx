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
        isRejected && "border-white/5 bg-white/2 opacity-50",
        !isAccepted && !isRejected && "border-white/10 bg-white/5",
      )}
    >
      {isEditing ? (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-white/50">Pytanie (przód)</label>
            <textarea
              className="w-full rounded border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-purple-400/50 focus:outline-none"
              rows={2}
              value={editFront}
              onChange={(e) => {
                setEditFront(e.target.value);
              }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/50">Odpowiedź (tył)</label>
            <textarea
              className="w-full rounded border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-purple-400/50 focus:outline-none"
              rows={2}
              value={editBack}
              onChange={(e) => {
                setEditBack(e.target.value);
              }}
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
              className="rounded border border-white/20 px-3 py-1 text-xs text-white/70 transition-colors hover:text-white"
            >
              Anuluj
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <p className={cn("text-sm font-medium text-white", isRejected && "line-through")}>
              {proposal.editedFront ?? proposal.front}
            </p>
            <p className={cn("text-sm text-white/60", isRejected && "line-through")}>
              {proposal.editedBack ?? proposal.back}
            </p>
          </div>
          {!isRejected && (
            <div className="flex shrink-0 gap-1.5">
              {!isAccepted && (
                <button
                  onClick={() => {
                    onUpdate(proposal.id, { status: "accepted" });
                  }}
                  className="rounded bg-green-600/70 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-green-500"
                >
                  Akceptuj
                </button>
              )}
              <button
                onClick={handleEdit}
                className="rounded border border-white/20 px-2.5 py-1 text-xs text-white/70 transition-colors hover:text-white"
              >
                Edytuj
              </button>
              <button
                onClick={() => {
                  onUpdate(proposal.id, { status: "rejected" });
                }}
                className="rounded border border-red-500/30 px-2.5 py-1 text-xs text-red-400/80 transition-colors hover:border-red-400 hover:text-red-300"
              >
                Odrzuć
              </button>
            </div>
          )}
          {isRejected && (
            <button
              onClick={() => {
                onUpdate(proposal.id, { status: "pending" });
              }}
              className="shrink-0 text-xs text-white/40 transition-colors hover:text-white/70"
            >
              Cofnij
            </button>
          )}
        </div>
      )}
    </div>
  );
}
