import { z } from 'zod';

export const CreateResidentSchema = z.object({
  name: z.string().min(1).max(128),
  nameKana: z.string().min(1).max(128).regex(/^[ァ-ヴー]+$/),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  villageId: z.number().int().min(1),
});

// DB 行レベルの型（Drizzle が返す Date オブジェクトを使用）
export const ResidentSchema = z.object({
  id: z.number(),
  name: z.string(),
  nameKana: z.string(),
  birthDate: z.string(),
  villageId: z.number(),
  createdAt: z.date(),
});

// API レスポンス用の型（JSON シリアライズ後の文字列になる。OpenAPI Resident.createdAt: string / format: date-time に対応）
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
