import { z } from 'zod';

export const GenerateSchema = z.object({
  text: z
    .string()
    .min(1000, 'Text must be at least 1000 characters')
    .max(10000, 'Text must be at most 10000 characters'),
});

export type GenerateInput = z.infer<typeof GenerateSchema>;
