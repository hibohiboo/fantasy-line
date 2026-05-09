import { z } from 'zod';

export const CreateResidentSchema = z.object({
  name: z.string().min(1),
  nameKana: z.string().min(1),
  birthDate: z.string(),
  villageId: z.number().int().min(1),
});

export const ResidentSchema = z.object({
  id: z.number(),
  name: z.string(),
  nameKana: z.string(),
  birthDate: z.string(),
  villageId: z.number(),
  createdAt: z.date(),
});

export const ResidentResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  nameKana: z.string(),
  birthDate: z.string(),
  villageId: z.number(),
  createdAt: z.string(),
});

export const ResidentWithVillageResponseSchema = ResidentResponseSchema.extend({
  villageName: z.string(),
});

export const CreateResidentResponseSchema = z.object({
  resident: ResidentResponseSchema,
});

export const ListResidentsResponseSchema = z.object({
  residents: z.array(ResidentWithVillageResponseSchema),
});

export const ListVillageResidentsResponseSchema = z.object({
  residents: z.array(ResidentResponseSchema),
});

export type CreateResidentInput = z.infer<typeof CreateResidentSchema>;
export type Resident = z.infer<typeof ResidentSchema>;
export type ResidentResponse = z.infer<typeof ResidentResponseSchema>;
export type ResidentWithVillageResponse = z.infer<typeof ResidentWithVillageResponseSchema>;
export type CreateResidentResponse = z.infer<typeof CreateResidentResponseSchema>;
export type ListResidentsResponse = z.infer<typeof ListResidentsResponseSchema>;
export type ListVillageResidentsResponse = z.infer<typeof ListVillageResidentsResponseSchema>;
