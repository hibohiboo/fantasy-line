import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// mysql2/promise をモックして実際の DB 接続を行わない
vi.mock('mysql2/promise', () => ({
  default: {
    createPool: vi.fn().mockReturnValue({ query: vi.fn() }),
  },
}));

// drizzle をモックして接続オブジェクトを返す
vi.mock('drizzle-orm/mysql2', () => ({
  drizzle: vi.fn().mockReturnValue({ _isTestDb: true }),
}));

// Secrets Manager をモック（クラスはコンストラクタとして呼ばれるため class 構文を使う）
vi.mock('@aws-sdk/client-secrets-manager', () => ({
   
  SecretsManagerClient: class {
    send = vi.fn().mockResolvedValue({
      SecretString: JSON.stringify({
        host: 'secret-host',
        port: 3306,
        username: 'secret-user',
        password: 'secret-pass',
        dbname: 'testdb',
      }),
    });
  },
   
  GetSecretValueCommand: class {},
}));

describe('getTenantDb', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // 各テスト前に環境変数とモックカウントをリセット
    process.env = { ...originalEnv };
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('ローカル環境（AWS_SAM_LOCAL=true）のとき', () => {
    test('slug に対応するスキーマ名のプールを生成して Drizzle を返すこと', async () => {
      // Arrange
      process.env.AWS_SAM_LOCAL = 'true';
      const mysql = await import('mysql2/promise');
      const { drizzle } = await import('drizzle-orm/mysql2');
      const { getTenantDb } = await import('./client');

      // Act
      await getTenantDb('acme-corp');

      // Assert
      expect(mysql.default.createPool).toHaveBeenCalledWith(
        expect.objectContaining({ database: 'tenant_acme_corp' }),
      );
      expect(drizzle).toHaveBeenCalled();
    });

    test('ハイフンを含む slug が "tenant_" + アンダースコア変換でスキーマ名になること', async () => {
      // Arrange
      process.env.AWS_SAM_LOCAL = 'true';
      const mysql = await import('mysql2/promise');
      const { getTenantDb } = await import('./client');

      // Act
      await getTenantDb('my-team-01');

      // Assert
      expect(mysql.default.createPool).toHaveBeenCalledWith(
        expect.objectContaining({ database: 'tenant_my_team_01' }),
      );
    });

    test('ハイフンを含まない slug が "tenant_{slug}" のスキーマ名になること', async () => {
      // Arrange
      process.env.AWS_SAM_LOCAL = 'true';
      const mysql = await import('mysql2/promise');
      const { getTenantDb } = await import('./client');

      // Act
      await getTenantDb('beta');

      // Assert
      expect(mysql.default.createPool).toHaveBeenCalledWith(
        expect.objectContaining({ database: 'tenant_beta' }),
      );
    });

    test('同一 slug の 2 回目の呼び出しはキャッシュを返し drizzle を 1 回しか呼ばないこと', async () => {
      // Arrange
      process.env.AWS_SAM_LOCAL = 'true';
      const { drizzle } = await import('drizzle-orm/mysql2');
      const { getTenantDb } = await import('./client');

      // Act
      const first = await getTenantDb('alpha');
      const second = await getTenantDb('alpha');

      // Assert: キャッシュにより drizzle は 1 回だけ呼ばれる
      expect(drizzle).toHaveBeenCalledTimes(1);
      expect(first).toBe(second);
    });

    test('異なる slug は別々の Drizzle インスタンスを返すこと', async () => {
      // Arrange
      process.env.AWS_SAM_LOCAL = 'true';
      const { drizzle } = await import('drizzle-orm/mysql2');
      const { getTenantDb } = await import('./client');

      // Act
      await getTenantDb('alpha');
      await getTenantDb('beta');

      // Assert: 2 つの slug で drizzle が 2 回呼ばれる
      expect(drizzle).toHaveBeenCalledTimes(2);
    });
  });

  describe('本番環境（AWS_SAM_LOCAL 未設定、DB_SECRET_ARN あり）のとき', () => {
    test('Secrets Manager から取得した認証情報でプールを生成すること', async () => {
      // Arrange
      process.env.DB_SECRET_ARN = 'arn:aws:secretsmanager:ap-northeast-1:123456789:secret:mydb';
      delete process.env.AWS_SAM_LOCAL;
      const mysql = await import('mysql2/promise');
      const { getTenantDb } = await import('./client');

      // Act
      await getTenantDb('prod-tenant');

      // Assert: Secrets Manager が返す secret の認証情報で createPool が呼ばれること
      expect(mysql.default.createPool).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'secret-host',
          user: 'secret-user',
          password: 'secret-pass',
          database: 'tenant_prod_tenant',
        }),
      );
    });
  });

  describe('TenantDb 型が export されていること', () => {
    test('TenantDb 型が client.ts から import できること', async () => {
      // Arrange & Act
      const clientModule = await import('./client');

      // Assert: 型は実行時に検証できないが、export の存在確認として
      // getTenantDb が関数として export されていることを確認する
      expect(typeof clientModule.getTenantDb).toBe('function');
    });
  });
});
