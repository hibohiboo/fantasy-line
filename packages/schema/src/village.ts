import { z } from 'zod';

export const CreateVillageSchema = z.object({
  name: z.string().min(1).max(128),
});

export const VillageSchema = z.object({
  id: z.number(),
  name: z.string(),
  ownerId: z.string(),
  createdAt: z.date(),
});

export const CreateVillageResponseSchema = z.object({
  village: VillageSchema,
});

export const ListVillagesResponseSchema = z.object({
  villages: z.array(VillageSchema),
});

export type CreateVillageInput = z.infer<typeof CreateVillageSchema>;
export type Village = z.infer<typeof VillageSchema>;
export type CreateVillageResponse = z.infer<typeof CreateVillageResponseSchema>;
export type ListVillagesResponse = z.infer<typeof ListVillagesResponseSchema>;
