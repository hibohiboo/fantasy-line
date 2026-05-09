import { bigint, date, int, mysqlTable, serial, timestamp, varchar } from 'drizzle-orm/mysql-core';

export const villages = mysqlTable('villages', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  ownerId: varchar('owner_id', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type Village = typeof villages.$inferSelect;
export type NewVillage = typeof villages.$inferInsert;

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

export const residents = mysqlTable('residents', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  nameKana: varchar('name_kana', { length: 128 }).notNull(),
  birthDate: date('birth_date', { mode: 'string' }).notNull(),
  villageId: bigint('village_id', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type Resident = typeof residents.$inferSelect;
export type NewResident = typeof residents.$inferInsert;
