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
        <h2 className="mb-2 text-xl font-semibold text-foreground">Zestaw zapisany!</h2>
        <p className="mb-6 text-sm text-muted-foreground">Twoje fiszki są gotowe do nauki.</p>
        <a
          href="/dashboard"
          className="text-sm text-purple-500 transition-colors hover:text-purple-400 hover:underline"
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
          onSave={(target) => void saveProposals(target)}
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
