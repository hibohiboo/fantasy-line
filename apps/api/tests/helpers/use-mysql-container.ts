import { beforeAll, afterAll } from 'vitest';
import type { StartedTestContainer } from 'testcontainers';
import type mysql from 'mysql2/promise';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import * as schema from '../../src/db/schema';
import { setupMysqlContainer } from './mysql-setup';

export function useMysqlContainer(): { db: MySql2Database<typeof schema> } {
  const ctx = {} as { db: MySql2Database<typeof schema> };
  let container: StartedTestContainer;
  let pool: mysql.Pool;

  beforeAll(async () => {
    ({ container, pool, testDb: ctx.db } = await setupMysqlContainer());
  });

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  return ctx;
}
