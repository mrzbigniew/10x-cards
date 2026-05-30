import { z } from "zod";
import { ProposalSchema } from "@/lib/schemas/generation";

export const CreateEmptyDeckSchema = z.object({
  name: z.string().min(1).max(200),
});

export const RenameDeckSchema = z.object({
  name: z.string().min(1).max(200),
});

export const AppendCardsToDeckSchema = z.object({
  deckId: z.uuid(),
  cards: ProposalSchema.array().min(1),
});
