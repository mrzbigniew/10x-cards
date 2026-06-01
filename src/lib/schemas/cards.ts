import { z } from "zod";

export const AddCardSchema = z.object({
  front: z.string().min(1).max(500),
  back: z.string().min(1).max(500),
});

export const UpdateCardSchema = z.object({
  front: z.string().min(1).max(500),
  back: z.string().min(1).max(500),
  resetSR: z.boolean(),
});
