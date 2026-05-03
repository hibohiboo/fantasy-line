import { z } from 'zod';

export const ItemRaritySchema = z.enum([
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
]);

export const CreateItemSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  rarity: ItemRaritySchema.optional(),
  price: z.number().int().min(0).optional(),
});

export const ItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  rarity: z.string(),
  price: z.number(),
  createdAt: z.date().nullable(),
});

export const CreateItemResponseSchema = z.object({
  item: ItemSchema,
});

export const GetItemsResponseSchema = z.object({
  items: z.array(ItemSchema),
});

export type ItemRarity = z.infer<typeof ItemRaritySchema>;
export type CreateItemInput = z.infer<typeof CreateItemSchema>;
export type Item = z.infer<typeof ItemSchema>;
export type CreateItemResponse = z.infer<typeof CreateItemResponseSchema>;
export type GetItemsResponse = z.infer<typeof GetItemsResponseSchema>;
