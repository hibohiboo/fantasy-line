import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import * as serviceSchema from './service-schema';
import * as tenantSchema from './tenant-template-schema';
import { slugToSchemaName } from '../shared/tenant';

interface DbSecret {
  host: string;
  port: number;
  username: string;
  password: string;
  dbname: string;
}

/**
 * DB 認証情報を解決する共通非同期関数。
 * 本番環境（AWS_SAM_LOCAL 未設定かつ DB_SECRET_ARN あり）では Secrets Manager から取得する。
 * それ以外（ローカル環境）では環境変数またはデフォルト値を使う。
 */
export async function resolveDbCredentials(): Promise<{
  host: string;
  port: number;
  user: string;
  password: string;
}> {
  const secretArn = process.env.DB_SECRET_ARN;
  const isLocal = process.env.AWS_SAM_LOCAL === 'true';

  if (!isLocal && secretArn) {
    const client = new SecretsManagerClient({});
    const { SecretString } = await client.send(
      new GetSecretValueCommand({ SecretId: secretArn }),
    );
    if (!SecretString) throw new Error('SecretString is empty');
    const secret = JSON.parse(SecretString) as DbSecret;
    return {
      host: secret.host,
      port: secret.port,
      user: secret.username,
      password: secret.password,
    };
  }

  return {
    host: process.env.DB_HOST ?? 'host.docker.internal', // infra/package.json の local-api スクリプトからの実行を想定
    port: Number(process.env.DB_PORT ?? '3306'),
    user: process.env.DB_USER ?? 'testuser',
    password: process.env.DB_PASSWORD ?? 'testpass',
  };
}

async function buildDb() {
  const creds = await resolveDbCredentials();
  const dbName = process.env.DB_NAME ?? 'testdb';
  const pool = mysql.createPool({
    ...creds,
    database: dbName,
    connectTimeout: 10000,
    waitForConnections: true,
    connectionLimit: 1,
  });
  return drizzle({ client: pool, schema: serviceSchema, mode: 'default' });
}

type DbInstance = Awaited<ReturnType<typeof buildDb>>;

let dbInstance: DbInstance | undefined;

export async function getDb(): Promise<DbInstance> {
  if (!dbInstance) {
    dbInstance = await buildDb();
  }
  return dbInstance;
}

/** Lambda モジュールスコープのキャッシュ（ウォームスタートで接続を再利用する） */
const tenantDbCache = new Map<string, TenantDb>();

/**
 * テナントスキーマ（tenant_{slug}）への Drizzle 接続を返す。
 * 同一 slug の接続はキャッシュして再利用する（ウォームスタート最適化）。
 *
 * @param slug - バリデーション済みのテナントスラッグ
 */
export type TenantDb = MySql2Database<typeof tenantSchema>;

export async function getTenantDb(slug: string): Promise<TenantDb> {
  if (tenantDbCache.has(slug)) return tenantDbCache.get(slug)!;

  const schemaName = slugToSchemaName(slug);
  const creds = await resolveDbCredentials();
  const pool = mysql.createPool({
    ...creds,
    database: schemaName,
    connectTimeout: 10000,
    waitForConnections: true,
    connectionLimit: 1,
  });
  const db = drizzle({ client: pool, schema: tenantSchema, mode: 'default' });
  tenantDbCache.set(slug, db);
  return db;
}
