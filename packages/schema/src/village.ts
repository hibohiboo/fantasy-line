import { z } from 'zod';

export const CreateVillageSchema = z.object({
  name: z.string().min(1).max(128),
});

// DB 行レベルの型（Drizzle が返す Date オブジェクトを使用）
export const VillageSchema = z.object({
  id: z.number(),
  name: z.string(),
  ownerId: z.string(),
  createdAt: z.date(),
});

// API レスポンス用の型（JSON シリアライズ後の文字列になる。OpenAPI Village.createdAt: string / format: date-time に対応）
export const VillageResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  ownerId: z.string(),
  createdAt: z.string(),
});

export const CreateVillageResponseSchema = z.object({
  village: VillageResponseSchema,
});

export const ListVillagesResponseSchema = z.object({
  villages: z.array(VillageResponseSchema),
});

export type CreateVillageInput = z.infer<typeof CreateVillageSchema>;
export type Village = z.infer<typeof VillageSchema>;
export type VillageResponse = z.infer<typeof VillageResponseSchema>;
export type CreateVillageResponse = z.infer<typeof CreateVillageResponseSchema>;
export type ListVillagesResponse = z.infer<typeof ListVillagesResponseSchema>;
