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
    // ローカルでは testdb に同居させる（service テーブルは既存テーブルと名前が競合しない）
    // 本番では DB_NAME=service を設定して接続先を切り替える
    database: process.env.DB_NAME ?? 'testdb',
  },
});
