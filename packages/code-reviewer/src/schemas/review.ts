import { z } from "zod";

export const ReviewSchema = z.object({
  summary: z.string(),
  issues: z.array(
    z.object({
      severity: z.enum(["error", "warning", "info"]),
      message: z.string(),
      // OpenAI strict structured-output mode requires every property in
      // `required`, so optionality is expressed as nullable (number | null)
      // rather than optional. `null` means "issue not tied to a line".
      line: z.number().nullable(),
    }),
  ),
  score: z.number().min(0).max(10),
});

export type Review = z.infer<typeof ReviewSchema>;
