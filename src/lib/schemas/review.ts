import { z } from "zod";

export const DueQuerySchema = z.object({
  due_before: z.iso.datetime(),
});

export const SubmitRatingSchema = z.object({
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});
