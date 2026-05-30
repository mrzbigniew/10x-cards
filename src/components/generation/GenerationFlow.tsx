import { useGeneration } from "@/components/hooks/useGeneration";
import { TextInputForm } from "@/components/generation/TextInputForm";
import { ProposalList } from "@/components/generation/ProposalList";
import { SaveDeckForm } from "@/components/generation/SaveDeckForm";

export function GenerationFlow() {
  const {
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
  } = useGeneration();

  if (phase === "done") {
    return (
      <div className="py-16 text-center">
        <div className="mb-3 text-4xl">✓</div>
        <h2 className="mb-2 text-xl font-semibold text-white">Zestaw zapisany!</h2>
        <p className="mb-6 text-sm text-white/60">Twoje fiszki są gotowe do nauki.</p>
        <a
          href="/dashboard"
          className="text-sm text-purple-300 transition-colors hover:text-purple-100 hover:underline"
        >
          Przejdź do panelu
        </a>
      </div>
    );
  }

  if (phase === "reviewing" || phase === "saving") {
    return (
      <div className="space-y-8">
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
          onSave={(deckName) => void saveProposals(deckName)}
        />
      </div>
    );
  }

  return (
    <TextInputForm
      text={text}
      onTextChange={setText}
      onGenerate={() => void generate()}
      isGenerating={phase === "generating"}
      errorMessage={errorMessage}
    />
  );
}
