import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema';

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? '3306'),
  user: process.env.DB_USER ?? 'testuser',
  password: process.env.DB_PASSWORD ?? 'testpass',
  database: process.env.DB_NAME ?? 'testdb',
  connectTimeout: 10000,
  waitForConnections: true,
  connectionLimit: 1,
});

export const db = drizzle({ client: pool, schema, mode: 'default' });
