import { z } from "zod";

export const ReviewSchema = z.object({
  summary: z.string(),
  issues: z.array(
    z.object({
      severity: z.enum(["error", "warning", "info"]),
      message: z.string(),
      line: z.number().optional(),
    }),
  ),
  score: z.number().min(0).max(10),
});

export type Review = z.infer<typeof ReviewSchema>;
