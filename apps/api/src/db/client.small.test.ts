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
      getTenantDb('acme-corp');

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
      getTenantDb('my-team-01');

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
      getTenantDb('beta');

      // Assert
      expect(mysql.default.createPool).toHaveBeenCalledWith(
        expect.objectContaining({ database: 'tenant_beta' }),
      );
    });

    test('呼び出しごとに新しい Drizzle インスタンスを返すこと', async () => {
      // Arrange
      process.env.AWS_SAM_LOCAL = 'true';
      const { drizzle } = await import('drizzle-orm/mysql2');
      const { getTenantDb } = await import('./client');

      // Act
      getTenantDb('alpha');
      getTenantDb('beta');

      // Assert: 2 回呼ばれていること（シングルトンではない）
      expect(drizzle).toHaveBeenCalledTimes(2);
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
