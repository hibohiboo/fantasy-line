import mysql from 'mysql2/promise';
import { GenericContainer, Wait } from 'testcontainers';

export type ServiceContainerContext = {
  host: string;
  port: number;
  rootPool: mysql.Pool;
  stop: () => Promise<void>;
};

/**
 * admin medium テスト用の MySQL testcontainer を起動し、service データベースを作成する。
 * 呼び出し元の beforeAll で await して使用し、stop を afterAll で呼ぶこと。
 *
 * @returns host, port, rootPool, stop を持つコンテキスト
 */
export async function startServiceContainer(): Promise<ServiceContainerContext> {
  const container = await new GenericContainer('mysql:8.0')
    .withEnvironment({ MYSQL_ROOT_PASSWORD: 'rootpass' })
    .withExposedPorts(3306)
    .withWaitStrategy(Wait.forLogMessage('ready for connections', 2))
    .start();

  const host = container.getHost();
  const port = container.getMappedPort(3306);

  const rootPool = mysql.createPool({
    host,
    port,
    user: 'root',
    password: 'rootpass',
    multipleStatements: true,
  });

  for (let i = 0; i < 20; i++) {
    try {
      await rootPool.query('SELECT 1');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  await rootPool.query('CREATE DATABASE IF NOT EXISTS `service`');

  return {
    host,
    port,
    rootPool,
    stop: async () => {
      await container.stop();
    },
  };
}
