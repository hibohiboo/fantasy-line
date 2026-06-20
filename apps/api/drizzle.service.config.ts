import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/service-schema.ts',
  out: './drizzle-service',
  dialect: 'mysql',
  dbCredentials: {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? '3306'),
    user: process.env.DB_USER ?? 'testuser',
    password: process.env.DB_PASSWORD ?? 'testpass',
    database: 'service',
  },
});
