# @fantasy-life/api

Lambda ハンドラー群と Drizzle ORM による MySQL アクセス層。

## DB セットアップ・マイグレーション

ローカル環境のセットアップ手順と各コマンドの使い方は以下を参照すること。

- **[DB 操作手順書](../../docs/design/non-functional/db-operations.md)** — ローカル初期構築・テナント追加・全テナントマイグレーションの手順
- **[マイグレーション方針](../../docs/design/non-functional/migration.md)** — スキーマ管理の設計方針・スキーマ変更手順

### スキーマ構成とファイル配置

```
drizzle-service/          # service スキーマのマイグレーション SQL（コミット必須）
drizzle-tenant/           # tenant テンプレートのマイグレーション SQL（コミット必須）
drizzle/                  # 旧 testdb のマイグレーション SQL（village/resident/item Hono 移行後に削除）
src/db/
  service-schema.ts       # service スキーマのテーブル定義
  tenant-template-schema.ts # tenant_{slug} スキーマのテーブル定義
  schema.ts               # 旧 testdb のテーブル定義（village/resident/item Hono 移行後に削除）
drizzle.service.config.ts
drizzle.tenant-template.config.ts
```

### コマンド一覧

| コマンド | 用途 | DB 接続 |
|---|---|---|
| `npm run db:up` | Docker MySQL を起動する | — |
| `npm run db:generate:service` | `service-schema.ts` から SQL を生成する | 不要 |
| `npm run db:generate:tenant` | `tenant-template-schema.ts` から SQL を生成する | 不要 |
| `npm run db:migrate:service:local` | `service` スキーマを作成してマイグレーションを適用する | 必要 |
| `npm run db:seed:service:local` | サービス権限マスタ（roles / role_permissions）を投入する | 必要 |
| `npm run db:migrate:all:local` | アクティブな全テナントスキーマを作成してマイグレーションを適用する | 必要 |

> `db:migrate:service:local` と `db:migrate:all:local` は `CREATE DATABASE IF NOT EXISTS` を行うため、
> `testuser` に CREATE 権限が必要。Docker コンテナ初回起動時に自動付与される（[db-operations.md](../../docs/design/non-functional/db-operations.md) 参照）。

### スキーマを変更するとき

変更対象のスキーマに応じたコマンドを実行する。

```bash
# service スキーマを変更した場合
npm run db:generate:service   # SQL を生成してコミットに含める
npm run db:migrate:service:local

# tenant テンプレートを変更した場合
npm run db:generate:tenant    # SQL を生成してコミットに含める
npm run db:migrate:all:local
```

詳細な手順は **[マイグレーション方針](../../docs/design/non-functional/migration.md)** を参照。

---

## テスト

[Google のテストサイズ定義](https://testing.googleblog.com/2010/12/test-sizes.html) に基づいてテストを分類しています。

### テストサイズ定義

| サイズ | ディレクトリ | スクリプト | 目安時間 |
|--------|-------------|-----------|---------|
| Small  | `tests/small/`  | `npm run test:small`  | ミリ秒単位 |
| Medium | `tests/medium/` | `npm run test:medium` | 数秒〜数十秒 |
| Large  | *(未実装)*      | —                     | 数分      |

```
tests/
  small/        # Small テスト
  medium/       # Medium テスト
    test/
      mysql-setup.ts  # testcontainers セットアップヘルパー
```

### テスト方針

#### フロントエンドとの整合性確認

API のレスポンス形式は `@repo/schema` に定義された Zod スキーマが唯一の正（Single Source of Truth）。
**フロントエンドはこのスキーマを使って型を生成するため、テストでも同スキーマで検証すること。**

```typescript
// 良い例：スキーマでパースしてフロントエンドが受け取れる形であることを保証する
import { EchoResponseSchema } from '@repo/schema';
const parsed = EchoResponseSchema.parse(JSON.parse(result.body));

// 悪い例：実装の詳細をそのままアサートするだけでフロントエンドとの整合が保証されない
expect(body.message).toEqual({ message: 'hello' }); // スキーマに反する値でも通ってしまう
```

スキーマに違反するレスポンスを返すテストケースは作成しない。
新たにレスポンス型を追加・変更した場合は対応する Zod スキーマを `@repo/schema` に追加すること。

#### アサーションの指針

冗長なアサーションを避け、テストの意図を明確にする。

| アサーション | 方針 | 理由 |
|---|---|---|
| `statusCode` (Small スキーマ検証) | **書かない** | `Schema.parse()` が例外を投げるためスキーマ検証が主アサーション |
| `statusCode` (200 / 201 / 400) | **書く** | HTTP ステータスコードはフロントエンドが依存する契約 |
| `headers['Content-Type']` | **書かない** | `JSON.parse()` / `Schema.parse()` が成功した時点で JSON と確定済み |

#### バリデーションエラーケースの記述

DB に依存しないバリデーションエラー（400）は Small テストで `it.each` を使ってまとめる。

```typescript
it.each([
  { label: 'nameが未指定', body: JSON.stringify({ price: 100 }), expectedError: ... },
  { label: 'nameが空文字', body: JSON.stringify({ name: '' }),    expectedError: ... },
])('$label 場合は400を返す', async ({ body, expectedError }) => { ... });
```

### Small テスト

外部リソースに依存しないテスト。

**条件（すべて満たすこと）**
- DB・ネットワーク・ファイルシステムへのアクセスなし
- 単一プロセス内で完結
- モックによる依存関係の代替は可

**対象例**
- `@repo/schema` のスキーマを使ったレスポンス形式の検証
- バリデーションエラー（400）ケースの網羅（`it.each` を使うこと）
- 純粋関数

### Medium テスト

ローカルリソースを使うテスト。

**条件**
- testcontainers による Docker コンテナ上の DB への接続を伴う
- ネットワーク通信はローカル（localhost）のみ
- Lambda ハンドラーと DB の統合動作を検証する

**規約**
- `tests/medium/test/mysql-setup.ts` の `setupMysqlContainer()` でコンテナを起動する
- `vi.doMock` + `vi.resetModules()` + 動的 `import` を `beforeEach` にまとめ、テスト間で handler を共有する
- テスト間のデータ干渉を防ぐため `beforeEach` でテーブルをクリアする

```typescript
// Medium テストの beforeEach パターン
import type * as MyModule from '../../../src/handlers/myHandler';
let handler: typeof MyModule.handler;

beforeEach(async () => {
  await testDb.delete(schema.items);
  vi.resetModules();
  vi.doMock('../../../src/db/client', () => ({ db: testDb }));
  ({ handler } = await import('../../../src/handlers/myHandler'));
});
```

### Large テスト

実際の外部サービス（AWS, 本番 DB など）を使う E2E テスト。現時点では未実装。

## テストの実行

```bash
# 全テスト
npm run test

# Small のみ（Docker 不要・高速）
npm run test:small

# Medium のみ（要 Docker）
npm run test:medium
```
