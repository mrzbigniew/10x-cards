import type { Proposal } from "@/components/hooks/useGeneration";
import { ProposalRow } from "@/components/generation/ProposalRow";

interface Props {
  proposals: Proposal[];
  onUpdate: (id: string, patch: Partial<Proposal>) => void;
  onBulkAccept: () => void;
  onBulkReject: () => void;
}

export function ProposalList({ proposals, onUpdate, onBulkAccept, onBulkReject }: Props) {
  const pendingCount = proposals.filter((p) => p.status === "pending").length;
  const acceptedCount = proposals.filter((p) => p.status === "accepted").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-foreground">Propozycje fiszek</h2>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
            {acceptedCount} zaakceptowanych · {pendingCount} oczekujących
          </span>
        </div>
        {pendingCount > 0 && (
          <div className="flex gap-2">
            <button
              onClick={onBulkAccept}
              className="rounded border border-green-500/30 px-3 py-1 text-xs text-green-400/80 transition-colors hover:border-green-400 hover:text-green-300"
            >
              Akceptuj pozostałe ({pendingCount})
            </button>
            <button
              onClick={onBulkReject}
              className="rounded border border-red-500/30 px-3 py-1 text-xs text-red-400/80 transition-colors hover:border-red-400 hover:text-red-300"
            >
              Odrzuć pozostałe ({pendingCount})
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {proposals.map((p) => (
          <ProposalRow key={p.id} proposal={p} onUpdate={onUpdate} />
        ))}
      </div>
    </div>
  );
}
