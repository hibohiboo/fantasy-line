import { int, mysqlTable, serial, timestamp, varchar } from 'drizzle-orm/mysql-core';

export const items = mysqlTable('items', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: varchar('description', { length: 1000 }),
  rarity: varchar('rarity', { length: 50 }).notNull().default('common'),
  price: int('price').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
