import { sqliteTable, text, real } from 'drizzle-orm/sqlite-core';
export const program = sqliteTable('program', {
  id: text('id').primaryKey(),
  data: text('data').notNull(),
});
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  date: text('date').notNull(),
  data: text('data').notNull(),
});
export const bodyWeights = sqliteTable('body_weights', {
  date: text('date').primaryKey(),
  weightKg: real('weight_kg').notNull(),
  createdAt: text('created_at').notNull(),
});
export const syncOperations = sqliteTable('sync_operations', {
  id: text('id').primaryKey(),
  createdAt: text('created_at').notNull(),
});
