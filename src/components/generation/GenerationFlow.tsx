import { useEffect } from "react";
import type { GenerationPhase, Proposal } from "@/components/hooks/useGeneration";
import { TextInputForm } from "@/components/generation/TextInputForm";
import { ProposalList } from "@/components/generation/ProposalList";
import { SaveDeckForm } from "@/components/generation/SaveDeckForm";

interface Props {
  phase: GenerationPhase;
  text: string;
  setText: (value: string) => void;
  proposals: Proposal[];
  errorMessage: string | null;
  generate: () => void;
  updateProposal: (id: string, patch: Partial<Proposal>) => void;
  bulkAccept: () => void;
  bulkReject: () => void;
  saveProposals: (target: { name: string } | { deckId: string }) => void;
  onDone?: () => void;
  preselectedDeckId?: string;
}

export function GenerationFlow({
  phase,
  text,
  setText,
  proposals,
  errorMessage,
  generate,
  updateProposal,
  bulkAccept,
  bulkReject,
  saveProposals,
  onDone,
  preselectedDeckId,
}: Props) {
  useEffect(() => {
    if (phase !== "done" || !onDone) return;
    onDone();
  }, [phase, onDone]);

  if (phase === "done") {
    return (
      <div data-testid="generation-phase-done" className="py-16 text-center">
        <div className="mb-3 text-4xl">✓</div>
        <h2 className="text-foreground mb-2 text-xl font-semibold">Zestaw zapisany!</h2>
        <p className="text-muted-foreground mb-6 text-sm">Twoje fiszki są gotowe do nauki.</p>
        {!onDone && (
          <a
            href="/dashboard"
            className="text-sm text-purple-500 transition-colors hover:text-purple-400 hover:underline"
          >
            Przejdź do panelu
          </a>
        )}
      </div>
    );
  }

  if (phase === "reviewing" || phase === "saving") {
    return (
      <div data-testid="generation-phase-reviewing" className="space-y-8">
        <ProposalList
          proposals={proposals}
          onUpdate={updateProposal}
          onBulkAccept={bulkAccept}
          onBulkReject={bulkReject}
        />
        <SaveDeckForm
          text={text}
          proposals={proposals}
          isSaving={phase === "saving"}
          onSave={(target) => {
            saveProposals(target);
          }}
          preselectedDeckId={preselectedDeckId}
        />
      </div>
    );
  }

  return (
    <div data-testid="generation-phase-input">
      <TextInputForm
        text={text}
        onTextChange={setText}
        onGenerate={() => {
          generate();
        }}
        isGenerating={phase === "generating"}
        errorMessage={errorMessage}
      />
    </div>
  );
}
