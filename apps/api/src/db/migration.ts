import { Handler } from 'aws-lambda';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { createConnection } from 'mysql2/promise';
import type { Connection } from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import * as path from 'path';

const secretsClient = new SecretsManagerClient({
  region: process.env.AWS_REGION ?? 'ap-northeast-1',
});

interface DbSecret {
  host: string;
  port: number;
  username: string;
  password: string;
  dbname: string;
}

async function getConnection(): Promise<Connection> {
  const secretArn = process.env.DB_SECRET_ARN;
  if (!secretArn)
    throw new Error('DB_SECRET_ARN environment variable is not set');
  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretArn }),
  );
  if (!response.SecretString) throw new Error('SecretString is empty');
  const secret = JSON.parse(response.SecretString) as DbSecret;
  return createConnection({
    host: secret.host,
    port: secret.port,
    user: secret.username,
    password: secret.password,
    database: secret.dbname,
    ssl: { rejectUnauthorized: false },
  });
}

export const handler: Handler = async () => {
  const connection = await getConnection();
  try {
    const db = drizzle(connection);
    await migrate(db, { migrationsFolder: path.join(__dirname, 'migrations') });
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Migration compoeted success' }),
    };
  } finally {
    await connection.end();
  }
};
