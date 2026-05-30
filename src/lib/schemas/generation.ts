import { z } from "zod";

export const GenerateRequestSchema = z.object({
  text: z.string().min(50).max(10000),
});

export const ProposalSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
});

export const GenerateResponseSchema = z.object({
  proposals: z.array(ProposalSchema),
});

export const NewDeckSaveSchema = z.object({
  name: z.string().min(1).max(200),
  cards: z.array(ProposalSchema),
});

export const ExistingDeckSaveSchema = z.object({
  deckId: z.uuid(),
  cards: z.array(ProposalSchema),
});

export const SaveDeckRequestSchema = z.union([NewDeckSaveSchema, ExistingDeckSaveSchema]);

export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;
export type Proposal = z.infer<typeof ProposalSchema>;
export type GenerateResponse = z.infer<typeof GenerateResponseSchema>;
export type NewDeckSave = z.infer<typeof NewDeckSaveSchema>;
export type ExistingDeckSave = z.infer<typeof ExistingDeckSaveSchema>;
export type SaveDeckRequest = z.infer<typeof SaveDeckRequestSchema>;
