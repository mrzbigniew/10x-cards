import { useState, useCallback } from "react";

export type ProposalStatus = "pending" | "accepted" | "rejected" | "editing";

export interface Proposal {
  id: string;
  front: string;
  back: string;
  status: ProposalStatus;
  editedFront?: string;
  editedBack?: string;
}

export type GenerationPhase = "input" | "generating" | "reviewing" | "saving" | "done";

export function useGeneration() {
  const [phase, setPhase] = useState<GenerationPhase>("input");
  const [text, setTextRaw] = useState("");
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const setText = useCallback((value: string) => {
    setTextRaw(value);
    setErrorMessage(null);
  }, []);

  const generate = useCallback(async () => {
    setPhase("generating");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const data = (await res.json()) as { proposals?: { front: string; back: string }[]; error?: string };

      if (!res.ok) {
        throw new Error(data.error ?? "Generowanie nie powiodło się");
      }

      const rawProposals = data.proposals ?? [];
      setProposals(
        rawProposals.map((p, i) => ({
          id: `${Date.now()}-${i}`,
          front: p.front,
          back: p.back,
          status: "pending" as const,
        })),
      );
      setPhase("reviewing");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generowanie nie powiodło się. Spróbuj ponownie.";
      setErrorMessage(message);
      setPhase("input");
    }
  }, [text]);

  const updateProposal = useCallback((id: string, patch: Partial<Proposal>) => {
    setProposals((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const bulkAccept = useCallback(() => {
    setProposals((prev) => prev.map((p) => (p.status === "pending" ? { ...p, status: "accepted" as const } : p)));
  }, []);

  const bulkReject = useCallback(() => {
    setProposals((prev) => prev.map((p) => (p.status === "pending" ? { ...p, status: "rejected" as const } : p)));
  }, []);

  const saveProposals = useCallback(
    async (saveTarget: { name: string } | { deckId: string }) => {
      setPhase("saving");

      const accepted = proposals
        .filter((p) => p.status === "accepted")
        .map((p) => ({
          front: p.editedFront ?? p.front,
          back: p.editedBack ?? p.back,
        }));

      try {
        const res = await fetch("/api/decks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...saveTarget, cards: accepted }),
        });

        const data = (await res.json()) as { deckId?: string; error?: string };

        if (!res.ok) {
          throw new Error(data.error ?? "Nie udało się zapisać zestawu");
        }

        setPhase("done");
        window.dispatchEvent(new CustomEvent("deck-saved"));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Nie udało się zapisać zestawu. Spróbuj ponownie.";
        setErrorMessage(message);
        setPhase("reviewing");
      }
    },
    [proposals],
  );

  const reset = useCallback(() => {
    setPhase("input");
    setTextRaw("");
    setProposals([]);
    setErrorMessage(null);
  }, []);

  return {
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
    reset,
  };
}
