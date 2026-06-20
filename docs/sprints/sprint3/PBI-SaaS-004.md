# PBI-SaaS-004 作業計画 — Hono + tenantContext + requirePermission ミドルウェア実装

Sprint 3 / 作成日: 2026-06-20

**想定読者**: 実装 SubAgent・実装担当者  
**目的**: PBI-SaaS-004 実装で必要なファイル配置・変更箇所・SubAgent 割り当てを記録する。  
**スコープ**: Hono 導入・tenantContext / requirePermission ミドルウェア・listVillages Hono 移行・旧系統削除。テナントプロビジョニング Lambda は含まない。

設計の根拠は [api-authz-multitenant.md](../../design/non-functional/api-authz-multitenant.md) を参照。

---

## 前提・依存関係

- **PBI-SaaS-003 完了が前提**: `apps/api/src/db/service-schema.ts` / `apps/api/src/db/tenant-template-schema.ts` が存在すること
- PBI-SaaS-002（Cognito CDK）完了が望ましいが、ローカル Docker 環境での検証はモック JWT で代替可能
- ローカル Docker MySQL が `tools/docker/docker-compose.yml` で起動できること（`apps/api` から `npm run db:up`）
- 統合テストでは `apps/api/src/shared/mysql-setup.ts` / `use-mysql-container.ts` のパターンに従うこと

---

## 変更ファイル一覧

| 操作 | ファイルパス | 内容 |
|---|---|---|
| 追加インストール | `apps/api/package.json` | `hono` を追加 |
| 更新 | `apps/api/src/db/tenant-template-schema.ts` | `villages` / `residents` / `items` テーブルを追加 |
| 新規生成（コマンド実行） | `apps/api/drizzle-tenant/` | `drizzle-kit generate` で業務テーブル分のマイグレーション SQL を追加生成 |
| 更新 | `apps/api/src/db/client.ts` | `getTenantDb(slug: string)` を追加（テナント別接続）。既存 `getDb()` は後方互換で残す |
| 新規作成 | `apps/api/src/shared/middleware/tenantContext.ts` | Tier 1 ミドルウェア |
| 新規作成 | `apps/api/src/shared/middleware/tenantContext.test.ts` | ユニットテスト（TDD: Red→Green） |
| 新規作成 | `apps/api/src/shared/middleware/requirePermission.ts` | Tier 2 ミドルウェア |
| 新規作成 | `apps/api/src/shared/middleware/requirePermission.test.ts` | ユニットテスト（TDD: Red→Green） |
| 更新 | `apps/api/src/village/listVillages.ts` | Hono ハンドラーパターンに移行（`c.get('tenantDb')` / `c.get('userId')` を使用） |
| 新規作成 | `apps/api/src/village/listVillages.integration.test.ts` | 統合テスト（Docker MySQL + tenant スキーマ） |
| 新規作成 | `apps/api/src/hono/app.ts` | Hono アプリ定義（ルーティング、ミドルウェア適用） |
| 新規作成 | `apps/api/src/hono/lambda.ts` | `handle(app)` で Lambda エントリポイントに変換 |
| 削除 | `apps/api/src/db/schema.ts` | 旧シングルテナントスキーマ |
| 削除 | `apps/api/drizzle.config.ts` | 旧 Drizzle 設定 |
| 削除 | `apps/api/drizzle/` | 旧マイグレーション履歴フォルダ |

---

## SubAgent 割り当て表

| # | サブタスク | SubAgent | 依存 |
|---|---|---|---|
| 1 | Hono インストール + `tenant-template-schema.ts` 業務テーブル追加 + マイグレーション生成 | `tdd-implementer` | なし |
| 2 | `db/client.ts` に `getTenantDb(slug)` を追加 | `tdd-implementer` | サブタスク 1 |
| 3 | `tenantContext.ts` 実装（ユニットテスト TDD） | `tdd-implementer` | サブタスク 2 |
| 4 | `requirePermission.ts` 実装（ユニットテスト TDD） | `tdd-implementer` | サブタスク 3 |
| 5 | `hono/app.ts` + `hono/lambda.ts` + `listVillages.ts` Hono 移行 + 統合テスト | `tdd-implementer` | サブタスク 4 |
| 6 | 旧系統削除（`schema.ts` / `drizzle.config.ts` / `drizzle/`） | `backend-engineer` | サブタスク 5 |
| 7 | セキュリティレビュー | `security-reviewer` | サブタスク 6 |

---

## `tenant-template-schema.ts` 業務テーブル追加仕様

PBI-SaaS-003 で作成したファイルに以下 3 テーブルを追加する。

### `villages`（テーブル名: `villages`）

| カラム名 | Drizzle 型 | 制約 |
|---|---|---|
| `id` | `bigint unsigned autoincrement primaryKey` | |
| `name` | `varchar('name', { length: 128 }).notNull()` | |
| `ownerId` | `bigint('owner_id', { mode: 'number', unsigned: true }).notNull()` | |
| `createdAt` | `datetime('created_at').notNull().default(sql\`CURRENT_TIMESTAMP\`)` | |

外部キー: `ownerId` → `tenantUsers.id`

### `residents`（テーブル名: `residents`）

| カラム名 | Drizzle 型 | 制約 |
|---|---|---|
| `id` | `bigint unsigned autoincrement primaryKey` | |
| `name` | `varchar('name', { length: 128 }).notNull()` | |
| `nameKana` | `varchar('name_kana', { length: 128 }).notNull()` | |
| `birthDate` | `date('birth_date', { mode: 'string' }).notNull()` | |
| `villageId` | `bigint('village_id', { mode: 'number', unsigned: true }).notNull()` | |
| `createdAt` | `datetime('created_at').notNull().default(sql\`CURRENT_TIMESTAMP\`)` | |

外部キー: `villageId` → `villages.id`

### `items`（テーブル名: `items`）

| カラム名 | Drizzle 型 | 制約 |
|---|---|---|
| `id` | `bigint unsigned autoincrement primaryKey` | |
| `name` | `varchar('name', { length: 128 }).notNull()` | |
| `ownerId` | `bigint('owner_id', { mode: 'number', unsigned: true }).notNull()` | |
| `createdAt` | `datetime('created_at').notNull().default(sql\`CURRENT_TIMESTAMP\`)` | |

外部キー: `ownerId` → `tenantUsers.id`

業務テーブル追加後、以下のコマンドでマイグレーション SQL を追加生成する:

```bash
cd apps/api && npm run db:generate:tenant
```

---

## `db/client.ts` 追加仕様

既存の `getDb()` は後方互換で残したまま、テナント別接続関数を追加する。

```typescript
/**
 * テナントスキーマ（tenant_{slug}）への Drizzle 接続を返す。
 *
 * @param slug - テナントスラッグ（slugToSchemaName で変換される）
 */
export function getTenantDb(slug: string) {
  const schemaName = slugToSchemaName(slug);
  const connection = mysql.createConnection({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? '3306'),
    user: process.env.DB_USER ?? 'testuser',
    password: process.env.DB_PASSWORD ?? 'testpass',
    database: schemaName,
  });
  return drizzle(connection, { schema: tenantSchema, mode: 'default' });
}
```

戻り値の型は `ReturnType<typeof getTenantDb>` として `hono/app.ts` の `Variables` 型定義で参照する。

---

## `tenantContext.ts` 実装仕様（Tier 1 ミドルウェア）

**ファイル**: `apps/api/src/shared/middleware/tenantContext.ts`

### Hono context 型定義

`hono/app.ts` に以下を定義し、ミドルウェアと各ハンドラーで共有する:

```typescript
type Variables = {
  tenantDb: ReturnType<typeof getTenantDb>;
  tenantSlug: string;
  userId: number;
  userType: 'tenant_admin' | 'tenant_user' | 'servicer_admin' | 'servicer_delegate';
};
```

### JWT claims の取得元

API Gateway が `event.requestContext.authorizer.jwt.claims` に渡す。`hono/aws-lambda` では `c.env.event` 経由で取得する。

### 処理フロー

#### `tenant_*` ユーザー（`custom:user_type` が `tenant_admin` または `tenant_user`）

1. JWT claims から `custom:tenant_id`（テナントスラッグ）を取得する
2. `validateSlug` でスラッグを検証する。失敗時は 400 を返す
3. `slugToSchemaName(slug)` でスキーマ名を導出する
4. `service.tenants` にスラッグが存在し `status = 'active'` であることを確認する。存在しない場合は 503 を返す
5. テナントスキーマ内の `users` テーブルにユーザー（`cognitoSub` 一致）が存在することを確認する。存在しない場合は 403 を返す
6. `c.set('tenantDb', getTenantDb(slug))`・`c.set('tenantSlug', slug)`・`c.set('userId', user.id)`・`c.set('userType', userType)` をセットして `next()` を呼ぶ

#### `servicer_*` ユーザー（`custom:user_type` が `servicer_admin` または `servicer_delegate`）

1. `X-Tenant-Id` ヘッダーからテナントスラッグを取得する。存在しない場合は 400 を返す
2. `validateSlug` でスラッグを検証する。失敗時は 400 を返す
3. `service.user_tenant_roles` でリクエストユーザー（`cognitoSub` 一致）がそのテナントに対してロールを持つことを確認する。存在しない場合は 403 を返す
4. `service.tenants` にスラッグが存在し `status = 'active'` であることを確認する。存在しない場合は 503 を返す
5. `c.set(...)` をセットして `next()` を呼ぶ

### エラーレスポンス

| 状況 | ステータス |
|---|---|
| `custom:user_type` が不正 / `custom:tenant_id` 欠如 / `X-Tenant-Id` 欠如 | 400 |
| ユーザーがテナントに属していない / ロールがない | 403 |
| テナントスキーマが存在しない / `status != 'active'` | 503 |

---

## `tenantContext.test.ts` テスト設計

```typescript
describe('tenantContext ミドルウェア', () => {
  describe('Scenario 1: tenant_admin ユーザーが有効なテナントにアクセスするとき', () => {
    test('tenantDb / tenantSlug / userId / userType が context にセットされ next が呼ばれること')
  })

  describe('Scenario 2: tenant_user が自テナントにアクセスするとき', () => {
    test('context がセットされ next が呼ばれること')
  })

  describe('Scenario 3: servicer_admin が X-Tenant-Id ヘッダー付きでアクセスするとき', () => {
    test('service.user_tenant_roles を確認し context がセットされること')
  })

  describe('Scenario 4: 無効なテナントスラッグのとき', () => {
    test('400 が返ること')
  })

  describe('Scenario 4b: テナントが inactive のとき', () => {
    test('503 が返ること')
  })

  describe('Scenario 4c: テナントユーザーがテナントスキーマに存在しないとき', () => {
    test('403 が返ること')
  })
})
```

DB アクセスは fake / stub に差し替えてユニットテストする。

---

## `requirePermission.ts` 実装仕様（Tier 2 ミドルウェア）

**ファイル**: `apps/api/src/shared/middleware/requirePermission.ts`

### シグネチャ

```typescript
export function requirePermission(resource: string, action: string): MiddlewareHandler<{ Variables: Variables }>
```

### 処理フロー

1. `c.get('userType')` を取得する
2. `userType === 'servicer_admin'` の場合: 権限チェックをスキップして `next()` を呼ぶ
3. それ以外の場合:
   - `tenantDb` から `user_roles` JOIN `role_permissions` WHERE `resource = resource AND action = action AND user_id = userId` を実行する
   - 一致するレコードが存在しない場合: 403 を返す
   - 存在する場合: `next()` を呼ぶ

### `requirePermission.test.ts` テスト設計

```typescript
describe('requirePermission ミドルウェア', () => {
  describe('Scenario 5: servicer_admin のとき', () => {
    test('DB を参照せず next が呼ばれること')
  })

  describe('Scenario 6: tenant_user が対象リソース・アクションの権限を持つとき', () => {
    test('next が呼ばれること')
  })

  describe('Scenario 6b: tenant_user が対象リソース・アクションの権限を持たないとき', () => {
    test('403 が返ること')
  })
})
```

---

## `listVillages.ts` 移行後の仕様

移行後のハンドラーイメージ:

```typescript
export const listVillagesHandler: Handler<{ Variables: Variables }> = async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const result = await tenantDb
    .select()
    .from(villages)
    .where(eq(villages.ownerId, userId))
    .orderBy(desc(villages.createdAt));
  return c.json({ villages: result });
};
```

---

## `hono/app.ts` 構成イメージ

```typescript
import { Hono } from 'hono';
import { Variables } from './types';
import { tenantContext } from '../shared/middleware/tenantContext';
import { requirePermission } from '../shared/middleware/requirePermission';
import { listVillagesHandler } from '../village/listVillages';

export const app = new Hono<{ Variables: Variables }>();

app.use('*', tenantContext);

app.get('/api/villages', requirePermission('village', 'read'), listVillagesHandler);
```

---

## `hono/lambda.ts` 構成イメージ

```typescript
import { handle } from 'hono/aws-lambda';
import { app } from './app';

export const handler = handle(app);
```

---

## 統合テストのセットアップ方針

**ファイル**: `apps/api/src/village/listVillages.integration.test.ts`

- `apps/api/src/shared/mysql-setup.ts` / `use-mysql-container.ts` を参照してセットアップする
- テスト用テナントスキーマ `tenant_test` を作成し、`drizzle-tenant/` のマイグレーションを適用する
- `tenant_test.users` にテストユーザーを挿入してから listVillages ハンドラーを呼び出す
- テスト終了後に `tenant_test` スキーマを削除する

### Scenario 7: 統合テスト

```typescript
describe('listVillages 統合テスト（Docker MySQL）', () => {
  describe('Scenario 7: テナントユーザーが村一覧を取得するとき', () => {
    test('自分が作成した村のみが降順で返ること')
    test('他のユーザーが作成した村は含まれないこと')
    test('村が存在しない場合は空配列が返ること')
  })
})
```

---

## 完了条件チェックリスト

- [ ] `npm install hono` が完了し、`apps/api/package.json` に追記されている
- [ ] `tenant-template-schema.ts` に `villages` / `residents` / `items` テーブルが追加されている
- [ ] `drizzle-tenant/` に業務テーブル分のマイグレーション SQL が生成されている
- [ ] `getTenantDb(slug)` が `apps/api/src/db/client.ts` に実装されている
- [ ] `tenantContext.ts` のユニットテストが全シナリオ（Scenario 1〜4）をカバーしている
- [ ] `requirePermission.ts` のユニットテストが全シナリオ（Scenario 5〜6）をカバーしている
- [ ] `listVillages.ts` が Hono パターンに移行している
- [ ] 統合テスト（Scenario 7）が Docker MySQL で通過している
- [ ] `npm run lint`（`apps/api`）が通過している
- [ ] `npm run test`（`apps/api`）が全テスト通過している
- [ ] 旧ファイル（`apps/api/src/db/schema.ts` / `apps/api/drizzle.config.ts` / `apps/api/drizzle/`）が削除されている
- [ ] セキュリティレビューが完了している
- [ ] `docs/pbi/README.md` の該当 PBI を `✅ 完了` に更新すること
- [ ] ユーザーの承認を得てから完了とすること
