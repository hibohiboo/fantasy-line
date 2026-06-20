# PBI-SaaS-003 作業計画 — DB スキーマ per テナント マイグレーション実装

Sprint 3 / 作成日: 2026-06-20

**想定読者**: 実装 SubAgent・実装担当者  
**目的**: Phase 3 実装で必要なファイル配置・変更箇所・SubAgent 割り当てを記録する。  
**スコープ**: スラッグ変換ユーティリティ・Drizzle スキーマ定義・マイグレーション設定・ツールスクリプトのみ。テナントプロビジョニング Lambda・Hono ミドルウェアは含まない。

設計の根拠は [db-schema-multitenant.md](../../design/non-functional/db-schema-multitenant.md) を参照。

---

## 前提・依存関係

- `apps/api` で `drizzle-orm ^0.45.x`・`drizzle-kit ^0.31.x`・`mysql2 ^3.22.x` を使用
- ローカル MySQL: `tools/docker/` の Docker Compose。`npm run db:up`（`apps/api`）で起動
- ローカル接続情報（デフォルト）: host `localhost`, port `3306`, user `testuser`, password `testpass`
- **既存 `drizzle.config.ts` と `apps/api/drizzle/` は変更しない**（後述「暫定的二重管理について」を参照）
- `tools/` は npm workspaces に含まれていない。ツールスクリプトは `apps/api` から `tsx ../../tools/scripts/<file>.ts` で実行する
- 完了後、PBI-SaaS-004（Hono tenantContext）・PBI-SaaS-005（プロビジョニング Lambda）が本 PBI の成果物に依存する

---

## 暫定的二重管理について（意図的な設計判断）

本 PBI 完了後、`apps/api` に以下の **2 系統の Drizzle 設定が並存する**。これは意図的な暫定状態である。

| 系統 | 設定ファイル | マイグレーション | 対象 DB | 状態 |
|---|---|---|---|---|
| 旧（シングルテナント） | `drizzle.config.ts` | `drizzle/` (0000〜0003) | `testdb` | **暫定維持** |
| 新（service スキーマ） | `drizzle.service.config.ts` | `drizzle-service/` | `service` | 本 PBI で新設 |
| 新（テナントテンプレート） | `drizzle.tenant-template.config.ts` | `drizzle-tenant/` | `tenant_template` | 本 PBI で新設（認可テーブルのみ） |

### 旧系統を今すぐ削除しない理由

- 業務テーブル（`villages`・`residents`・`items`）を `tenant-template-schema.ts` に移行するには、既存ローカルデータの移行計画が必要
- `apps/api/src/db/client.ts` がまだシングルテナント接続のままであり、DB 接続切替（PBI-SaaS-004）と同時に行うのが自然

### 削除タイミング（PBI-SaaS-004 のスコープ）

PBI-SaaS-004（Hono tenantContext 実装）において以下を実施する（PBI-SaaS-004.md に明記済み）:

1. `tenant-template-schema.ts` に業務テーブル（`villages`・`residents`・`items`）を追加する
2. `drizzle-tenant/` に業務テーブルのマイグレーション SQL を追加生成する
3. `apps/api/src/db/client.ts` をテナント別接続に切り替える
4. `apps/api/src/db/schema.ts`・`apps/api/drizzle.config.ts`・`apps/api/drizzle/` を削除する

この完了をもって旧系統が完全に廃止され、二重管理が解消される。

---

## ファイル配置

### 新規作成

| ファイル | 役割 |
|---|---|
| `apps/api/src/shared/tenant.ts` | スラッグ変換・バリデーション関数 |
| `apps/api/src/shared/tenant.small.test.ts` | スラッグ変換のユニットテスト |
| `apps/api/src/db/service-schema.ts` | `service` スキーマ Drizzle テーブル定義 |
| `apps/api/src/db/tenant-template-schema.ts` | `tenant_{slug}` テンプレート Drizzle テーブル定義 |
| `apps/api/drizzle.service.config.ts` | `service` スキーマ向け Drizzle-kit 設定 |
| `apps/api/drizzle.tenant-template.config.ts` | テナントテンプレート向け Drizzle-kit 設定 |
| `apps/api/drizzle-service/` | `service` スキーマのマイグレーション SQL（`drizzle-kit generate` で自動生成） |
| `apps/api/drizzle-tenant/` | テナントテンプレートのマイグレーション SQL（`drizzle-kit generate` で自動生成） |
| `tools/scripts/seed-service-permissions.ts` | `service.role_permissions` 初期データ投入スクリプト |
| `tools/scripts/migrate-all-tenants.ts` | 全テナント横断マイグレーションスクリプト |

### 変更

| ファイル | 変更内容 |
|---|---|
| `apps/api/package.json` | `db:generate:service`・`db:generate:tenant`・`db:migrate:service:local`・`db:seed:service:local`・`db:migrate:all:local` スクリプトを追加 |

---

## スラッグ変換ユーティリティ仕様

**ファイル**: `apps/api/src/shared/tenant.ts`

### `slugToSchemaName(slug: string): string`

- ハイフン（`-`）をアンダースコア（`_`）に変換する
- `tenant_` プレフィックスを付与する
- バリデーションは行わない（呼び出し元が事前に `validateSlug` を通す責務を持つ）

変換例:

| 入力 | 出力 |
|---|---|
| `"acme-corp"` | `"tenant_acme_corp"` |
| `"beta"` | `"tenant_beta"` |
| `"my-team-01"` | `"tenant_my_team_01"` |

### `validateSlug(slug: string): { valid: true } | { valid: false; reason: string }`

バリデーションルール（すべて満たす必要がある）:

- 使用可能文字: 英小文字 `a-z`・数字 `0-9`・ハイフン `-` のみ
- 長さ: 2〜32 文字（両端を含む）
- 先頭・末尾はアルファベットまたは数字（ハイフン不可）

---

## `service` スキーマ定義

**ファイル**: `apps/api/src/db/service-schema.ts`

`mysqlTable` を使用する（スキーマプレフィックスなし）。接続先データベースは `drizzle.service.config.ts` で `database: 'service'` を指定する。

### `serviceUsers`（テーブル名: `users`）

| カラム名 | Drizzle 型 | 制約 |
|---|---|---|
| `id` | `bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey()` | |
| `cognitoSub` | `varchar('cognito_sub', { length: 128 }).notNull()` | `.unique()` |
| `email` | `varchar('email', { length: 255 }).notNull()` | `.unique()` |
| `userType` | `mysqlEnum('user_type', ['servicer_admin', 'servicer_delegate']).notNull()` | |
| `createdAt` | `datetime('created_at').notNull().default(sql\`CURRENT_TIMESTAMP\`)` | |

### `serviceTenants`（テーブル名: `tenants`）

| カラム名 | Drizzle 型 | 制約 |
|---|---|---|
| `id` | `bigint unsigned autoincrement primaryKey` | |
| `slug` | `varchar('slug', { length: 32 }).notNull()` | `.unique()` |
| `name` | `varchar('name', { length: 255 }).notNull()` | |
| `status` | `mysqlEnum('status', ['active', 'suspended', 'deleted']).notNull().default('active')` | |
| `createdAt` | `datetime('created_at').notNull().default(sql\`CURRENT_TIMESTAMP\`)` | |

### `serviceRoles`（テーブル名: `roles`）

| カラム名 | Drizzle 型 | 制約 |
|---|---|---|
| `id` | `bigint unsigned autoincrement primaryKey` | |
| `name` | `varchar('name', { length: 64 }).notNull()` | `.unique()` |

### `serviceUserTenantRoles`（テーブル名: `user_tenant_roles`）

| カラム名 | Drizzle 型 |
|---|---|
| `userId` | `bigint('user_id', { mode: 'number', unsigned: true }).notNull()` |
| `tenantId` | `bigint('tenant_id', { mode: 'number', unsigned: true }).notNull()` |
| `roleId` | `bigint('role_id', { mode: 'number', unsigned: true }).notNull()` |

複合 PK: `primaryKey({ columns: [t.userId, t.tenantId, t.roleId] })`

外部キー:
- `userId` → `serviceUsers.id`
- `tenantId` → `serviceTenants.id`
- `roleId` → `serviceRoles.id`

### `serviceRolePermissions`（テーブル名: `role_permissions`）

| カラム名 | Drizzle 型 |
|---|---|
| `roleId` | `bigint('role_id', { mode: 'number', unsigned: true }).notNull()` |
| `resource` | `varchar('resource', { length: 64 }).notNull()` |
| `action` | `varchar('action', { length: 64 }).notNull()` |

複合 PK: `primaryKey({ columns: [t.roleId, t.resource, t.action] })`

外部キー: `roleId` → `serviceRoles.id`

---

## テナントテンプレートスキーマ定義

**ファイル**: `apps/api/src/db/tenant-template-schema.ts`

`mysqlTable` を使用する（スキーマプレフィックスなし）。接続先データベースは `drizzle.tenant-template.config.ts` で `database: 'tenant_template'` を指定する。

### `tenantUsers`（テーブル名: `users`）

| カラム名 | Drizzle 型 | 制約 |
|---|---|---|
| `id` | `bigint unsigned autoincrement primaryKey` | |
| `cognitoSub` | `varchar('cognito_sub', { length: 128 }).notNull()` | `.unique()` |
| `email` | `varchar('email', { length: 255 }).notNull()` | |
| `userType` | `mysqlEnum('user_type', ['tenant_admin', 'tenant_user']).notNull()` | |
| `createdAt` | `datetime('created_at').notNull().default(sql\`CURRENT_TIMESTAMP\`)` | |

### `tenantRoles`（テーブル名: `roles`）

| カラム名 | Drizzle 型 | 制約 |
|---|---|---|
| `id` | `bigint unsigned autoincrement primaryKey` | |
| `name` | `varchar('name', { length: 64 }).notNull()` | |
| `isDefault` | `tinyint('is_default', { unsigned: true }).notNull().default(0)` | |

### `tenantUserRoles`（テーブル名: `user_roles`）

| カラム名 | Drizzle 型 |
|---|---|
| `userId` | `bigint('user_id', { mode: 'number', unsigned: true }).notNull()` |
| `roleId` | `bigint('role_id', { mode: 'number', unsigned: true }).notNull()` |

複合 PK: `primaryKey({ columns: [t.userId, t.roleId] })`

外部キー: `userId` → `tenantUsers.id`、`roleId` → `tenantRoles.id`

### `tenantRolePermissions`（テーブル名: `role_permissions`）

| カラム名 | Drizzle 型 |
|---|---|
| `roleId` | `bigint('role_id', { mode: 'number', unsigned: true }).notNull()` |
| `resource` | `varchar('resource', { length: 64 }).notNull()` |
| `action` | `varchar('action', { length: 64 }).notNull()` |

複合 PK: `primaryKey({ columns: [t.roleId, t.resource, t.action] })`

外部キー: `roleId` → `tenantRoles.id`

---

## Drizzle-kit 設定ファイル

### `apps/api/drizzle.service.config.ts`

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/service-schema.ts',
  out: './drizzle-service',
  dialect: 'mysql',
  dbCredentials: {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? '3306'),
    user: process.env.DB_USER ?? 'testuser',
    password: process.env.DB_PASSWORD ?? 'testpass',
    database: 'service',
  },
});
```

### `apps/api/drizzle.tenant-template.config.ts`

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/tenant-template-schema.ts',
  out: './drizzle-tenant',
  dialect: 'mysql',
  dbCredentials: {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? '3306'),
    user: process.env.DB_USER ?? 'testuser',
    password: process.env.DB_PASSWORD ?? 'testpass',
    database: 'tenant_template',
  },
});
```

---

## `apps/api/package.json` 追加スクリプト

```json
"db:generate:service": "drizzle-kit generate --config=drizzle.service.config.ts",
"db:generate:tenant": "drizzle-kit generate --config=drizzle.tenant-template.config.ts",
"db:migrate:service:local": "drizzle-kit push --config=drizzle.service.config.ts",
"db:seed:service:local": "tsx ../../tools/scripts/seed-service-permissions.ts",
"db:migrate:all:local": "tsx ../../tools/scripts/migrate-all-tenants.ts"
```

---

## `tools/scripts/seed-service-permissions.ts` 実装方針

このスクリプトは `apps/api` ディレクトリから `tsx ../../tools/scripts/seed-service-permissions.ts` で実行する。
`mysql2` と `drizzle-orm` は `apps/api/node_modules` から解決される。

### 処理フロー

1. 環境変数（`DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD`、デフォルト値あり）で `service` データベースに接続する
2. `roles` テーブルに以下を `INSERT IGNORE` で冪等挿入する:
   - `{ name: 'servicer_admin' }`
   - `{ name: 'servicer_delegate' }`
3. 挿入した（または既存の）ロール ID を取得する
4. `role_permissions` テーブルに以下を `INSERT IGNORE` で冪等挿入する:

| role | resource | action |
|---|---|---|
| `servicer_admin` | `tenant` | `read` |
| `servicer_admin` | `tenant` | `write` |
| `servicer_admin` | `tenant` | `delete` |
| `servicer_admin` | `user` | `read` |
| `servicer_admin` | `user` | `write` |
| `servicer_admin` | `user` | `delete` |
| `servicer_delegate` | `tenant` | `read` |
| `servicer_delegate` | `user` | `read` |

5. 投入件数をログ出力して終了する

### 冪等性の確保

`INSERT IGNORE INTO roles (name) VALUES (?)` を使用する（`UNIQUE` 制約によって重複時は自動スキップ）。`role_permissions` も同様。

---

## `tools/scripts/migrate-all-tenants.ts` 実装方針

このスクリプトは `apps/api` ディレクトリから `tsx ../../tools/scripts/migrate-all-tenants.ts` で実行する。

### 処理フロー

1. 環境変数で `service` データベースに接続する
2. `SELECT slug FROM tenants WHERE status = 'active' ORDER BY slug ASC` でスラッグ一覧を取得する
3. 各スラッグに対して以下を実行する:
   a. `slugToSchemaName(slug)` でスキーマ名（= データベース名）を導出する
   b. `tenant_{slug}` データベースへの接続を新たに作成する
   c. Drizzle の `migrate()` を実行する（マイグレーションフォルダ: スクリプトの `__dirname` から `../../apps/api/drizzle-tenant` の絶対パスを解決する）
   d. 成功したらログ出力する
   e. 失敗したらエラーをログに記録し、次のテナントに進む（ロールバックしない）
4. 最後に成功数・失敗数・失敗したスラッグ一覧をログ出力して終了する

### `slugToSchemaName` の利用

スクリプト内に直接実装するか、`apps/api/src/shared/tenant.ts` から相対インポートする。
相対インポートする場合のパス: `../../apps/api/src/shared/tenant.ts`（スクリプトの実行位置が `tools/scripts/` のため）。

---

## テスト設計

**ファイル**: `apps/api/src/shared/tenant.small.test.ts`

```ts
describe('slugToSchemaName', () => {
  test('"acme-corp" を変換すると "tenant_acme_corp" が返ること')
  test('"beta" を変換すると "tenant_beta" が返ること')
  test('"my-team-01" を変換すると "tenant_my_team_01" が返ること')
})

describe('validateSlug', () => {
  describe('有効なスラッグのとき', () => {
    test('"acme-corp" → valid であること')
    test('"beta" → valid であること')
    test('"a1" → valid であること（最小長 2 文字）')
    test('32 文字のスラッグ → valid であること（最大長）')
  })

  describe('無効なスラッグのとき', () => {
    test('"UPPER" → バリデーションエラーが返ること（大文字を含む）')
    test('"a" → バリデーションエラーが返ること（1 文字、最小 2 文字未満）')
    test('33 文字のスラッグ → バリデーションエラーが返ること（32 文字超）')
    test('"-abc" → バリデーションエラーが返ること（先頭ハイフン）')
    test('"abc-" → バリデーションエラーが返ること（末尾ハイフン）')
    test('"abc_def" → バリデーションエラーが返ること（アンダースコアを含む）')
    test('"abc def" → バリデーションエラーが返ること（スペースを含む）')
  })
})
```

実行コマンド: `cd apps/api && npm run test:small`

---

## SubAgent 割り当て

| # | サブタスク | SubAgent | 参照セクション |
|---|---|---|---|
| 1 | `tenant.ts` + `tenant.small.test.ts`（TDD: Red→Green→Refactor） | `tdd-implementer` | §スラッグ変換ユーティリティ仕様・§テスト設計 |
| 2 | `service-schema.ts` + `tenant-template-schema.ts` 新規作成 | `backend-engineer` | §service スキーマ定義・§テナントテンプレートスキーマ定義 |
| 3 | Drizzle-kit 設定ファイル新規作成 + マイグレーション SQL 生成 | `backend-engineer` | §Drizzle-kit 設定ファイル・§package.json 追加スクリプト |
| 4 | `tools/scripts/` 2 スクリプト実装 | `backend-engineer` | §seed 実装方針・§migrate-all 実装方針 |
| 5 | セキュリティレビュー | `security-reviewer` | db-schema-multitenant.md 全体 |

**依存関係**:
- サブタスク 1 はほかに依存なし（最初に実施可能）
- サブタスク 2 はほかに依存なし（サブタスク 1 と並行可能）
- サブタスク 3 はサブタスク 2 完了後に実施する（スキーマ定義が必要）
- サブタスク 4 はサブタスク 1・3 完了後に実施する（`slugToSchemaName` とマイグレーションフォルダが必要）
- サブタスク 5 はサブタスク 1〜4 完了後に実施する

---

## セキュリティレビュー結果（2026-06-20）

### HIGH → 対処済み: `migrate-all-tenants.ts` でスラッグ検証漏れ

**内容**: `migrateTenant(slug)` 内で `slugToSchemaName` を呼ぶ前に `validateSlug` を呼んでいなかった。DB の `tenants.slug` に不正な値が混入した場合に意図しないスキーマへマイグレーションが走るリスクがあった。

**対処**: `migrateTenant` の冒頭で `validateSlug` を呼び、検証失敗時は `Error` を投げるよう修正済み（失敗 slug は `failedSlugs` に記録される）。

### MEDIUM: FK に `ON DELETE` が未指定

`service-schema.ts` / `tenant-template-schema.ts` の外部キーに `onDelete` が明示されていない。MySQL デフォルトは `RESTRICT`（安全側）だが意図が不明確。後続 PBI でテナント削除・ユーザー削除フローを実装する際に明示すること。

### MEDIUM: `servicer_admin` の `delete` 権限の業務的意味

`seed-service-permissions.ts` の `tenant:delete` / `user:delete` は `service.tenants.status = 'deleted'` による論理削除と物理削除のどちらを想定するかを PBI-SaaS-005/006 の設計時に明確化すること。

### LOW: ツールスクリプトのエラーログ

`console.error` の出力に mysql2 接続エラー詳細（ホスト・ポート）が含まれる可能性があるが、スクリプトはローカル・運用端末からの実行を前提とし Lambda 上では動かないため許容範囲。

---

## 完了条件チェックリスト

- [x] `npm run test:small`（`apps/api`）で `tenant.small.test.ts` の全テストが通ること
- [x] `npm run db:generate:service`（`apps/api`）でエラーなく実行できること
- [x] `npm run db:generate:tenant`（`apps/api`）でエラーなく実行できること
- [x] `apps/api/drizzle-service/` にマイグレーション SQL が生成されていること
- [x] `apps/api/drizzle-tenant/` にマイグレーション SQL が生成されていること
- [ ] ローカル Docker MySQL（`npm run db:up`）を起動した状態で `npm run db:migrate:service:local`（`apps/api`）が通ること
- [ ] 上記後、`npm run db:seed:service:local` が通ること（2 回実行してもエラーなし）
- [ ] `service.tenants` にテストデータを 2 件投入した後、`npm run db:migrate:all:local` が全件成功すること
- [ ] 存在しないテナントスキーマを含む場合、`npm run db:migrate:all:local` がエラーテナントをスキップして正常終了すること
- [ ] `npm run lint`（`apps/api`）が通ること
- [ ] セキュリティレビュー完了・HIGH 指摘対処済みであること
