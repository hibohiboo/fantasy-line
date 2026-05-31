import { z } from 'zod';

export const EchoResponseSchema = z.object({
  message: z.string(),
});

export type EchoResponse = z.infer<typeof EchoResponseSchema>;
