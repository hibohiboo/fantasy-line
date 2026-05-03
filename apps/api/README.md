# @fantasy-life/api

Lambda ハンドラー群と Drizzle ORM による MySQL アクセス層。

## マイグレーション

### ファイル構成

```
drizzle/
  0000_*.sql        # 自動生成されたマイグレーション SQL（コミット必須）
  meta/             # drizzle-kit の内部メタデータ（コミット必須）
src/db/
  schema.ts         # テーブル定義の唯一の正（Single Source of Truth）
```

### 指針

**`schema.ts` を変更したら必ず `db:generate` を実行すること。**

マイグレーションファイルはテストの `migrate()` でも使われるため、
`schema.ts` と `drizzle/` が乖離するとテストが実際のスキーマと異なる状態で動作する。

### 手順

```bash
# 1. src/db/schema.ts を編集する

# 2. マイグレーションファイルを生成する（DB接続不要）
npm run db:generate

# 3. 生成された drizzle/*.sql を必ずコミットに含める

# 4. ローカル DB に適用する（開発時）
npm run db:migrate:local
```

### 各コマンドの使い分け

| コマンド | 用途 | DB接続 |
|---------|------|--------|
| `npm run db:generate` | `schema.ts` からマイグレーション SQL を生成 | 不要 |
| `npm run db:migrate:local` | ローカル DB にスキーマを適用（`drizzle-kit push`） | 必要 |

> **注意**: `db:migrate:local` は `drizzle-kit push` のため差分 SQL を直接適用する。
> 本番環境へのマイグレーションは `migrate()` + 生成済み SQL ファイルを使うこと。

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
