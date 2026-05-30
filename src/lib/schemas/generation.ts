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

export const SaveDeckRequestSchema = z.object({
  name: z.string().min(1).max(200),
  cards: z.array(ProposalSchema).min(1),
});

export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;
export type Proposal = z.infer<typeof ProposalSchema>;
export type GenerateResponse = z.infer<typeof GenerateResponseSchema>;
export type SaveDeckRequest = z.infer<typeof SaveDeckRequestSchema>;
