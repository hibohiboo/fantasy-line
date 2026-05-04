import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import * as schema from './schema';

interface DbSecret {
  host: string;
  port: number;
  username: string;
  password: string;
  dbname: string;
}

async function buildDb() {
  const secretArn = process.env.DB_SECRET_ARN;
  const isLocal = process.env.AWS_SAM_LOCAL === 'true';

  if (!isLocal && secretArn) {
    const client = new SecretsManagerClient({});
    const { SecretString } = await client.send(
      new GetSecretValueCommand({ SecretId: secretArn }),
    );
    if (!SecretString) throw new Error('SecretString is empty');
    const secret = JSON.parse(SecretString) as DbSecret;
    const pool = mysql.createPool({
      host: secret.host,
      port: secret.port,
      user: secret.username,
      password: secret.password,
      database: secret.dbname,
      connectTimeout: 10000,
      waitForConnections: true,
      connectionLimit: 1,
    });
    return drizzle({ client: pool, schema, mode: 'default' });
  }

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
  return drizzle({ client: pool, schema, mode: 'default' });
}

type DbInstance = Awaited<ReturnType<typeof buildDb>>;

let dbInstance: DbInstance | undefined;

export async function getDb(): Promise<DbInstance> {
  if (!dbInstance) {
    dbInstance = await buildDb();
  }
  return dbInstance;
}
