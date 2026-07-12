# PBI-SaaS-005b 作業計画 — テナントプロビジョニング Lambda 品質補完

Sprint 3 / 作成日: 2026-06-21

**想定読者**: 実装 SubAgent・実装担当者  
**目的**: PBI-SaaS-005 実装完了後に判明した 2 つの未解決問題（roles シード冪等性の欠如・medium テストの migrate モック化）を修正する。  
**スコープ**: `apps/api/src/admin/` 配下の既存ファイル修正と新規 medium テスト追加のみ。設計変更・CDK 変更・フロントエンドは含まない。

未解決問題の詳細は [PBI-SaaS-005.md](./PBI-SaaS-005.md) の「未解決事項」セクションを参照。

---

## 前提・依存関係

- **PBI-SaaS-005 完了済み**: `apps/api/src/admin/` 配下に以下が存在すること
  - `setupServiceSchema.ts` / `setupServiceSchema.small.test.ts`
  - `createTenant.ts` / `createTenant.medium.test.ts`
  - `migrateAllTenants.ts` / `migrateAllTenants.medium.test.ts`
- ローカル: Docker MySQL が起動済みであること（`apps/api` から `npm run db:up`）
- Testcontainers を使う medium テストは Docker が必要

---

## 実装仕様

### サブタスク 1: `setupServiceSchema.ts` の roles シードを冪等化する

**変更前後の対照表:**

| 項目 | 変更前 | 変更後 |
|---|---|---|
| ファイル | `apps/api/src/admin/setupServiceSchema.ts` | 同左 |
| roles シード実装 | `await db.insert(serviceRoles).values(ROLES.map((name) => ({ name })))` | `await db.execute(sql\`INSERT IGNORE INTO roles (name) VALUES ('servicer_admin'), ('servicer_delegate')\`)` |
| 不要になるインポート | `import { serviceRoles } from '../db/service-schema'` | 参照がなければ削除 |

**変更の理由:**
- 現状の `db.insert(serviceRoles).values(...)` は Drizzle 標準 INSERT であり、2 回目の呼び出し時に `ER_DUP_ENTRY` エラーが発生する
- `role_permissions` シードは既に `INSERT IGNORE` raw SQL で実装済み。`roles` シードも同じパターンに統一する

### サブタスク 2: `setupServiceSchema.small.test.ts` の roles INSERT テストを更新する

**変更前後の対照表:**

| 項目 | 変更前 | 変更後 |
|---|---|---|
| ファイル | `apps/api/src/admin/setupServiceSchema.small.test.ts` | 同左 |
| テスト「roles の INSERT IGNORE が呼ばれること」 | `expect(mockInsert).toHaveBeenCalled()` と `expect(mockInsertValues).toHaveBeenCalledWith(...)` で確認 | `expect(mockDbExecute).toHaveBeenCalledWith(expect.objectContaining({ sql: expect.stringContaining('INSERT IGNORE') }))` で確認 |
| モック設定 `setupSuccessMocks()` | `mockInsertValues.mockResolvedValue(undefined)` / `mockInsert.mockReturnValue(...)` を設定 | `mockInsert` / `mockInsertValues` が不要になる（roles 分）。`mockDbExecute` で対応 |

**注意:** `role_permissions` シードの `mockDbExecute` は変更前から存在するため、roles の INSERT IGNORE が追加で呼ばれる形になる。`mockDbExecute` の呼び出し回数・引数の検証を適切に更新すること。

### サブタスク 3: `setupServiceSchema.medium.test.ts` を新規作成する

**新規ファイル:** `apps/api/src/admin/setupServiceSchema.medium.test.ts`

**テスト内容（Scenario A — 受け入れ条件）:**

```
Given Testcontainers MySQL が起動している
When  POST /admin/setup/service-schema を 2 回呼んだとき
Then  両方とも 200 OK が返ること
And   service.roles に servicer_admin / servicer_delegate が 1 件ずつ存在すること
```

**実装方針:**
- Testcontainers で MySQL を起動し、実際の service DB にマイグレーション適用（`path.resolve(process.cwd(), 'drizzle-service')` を使用）
- `resolveDbCredentials` をテストコンテナの接続情報でモック
- `setupServiceSchemaHandler` を 2 回呼び出し、両方 200 OK を確認
- `service.roles` テーブルを SELECT して、`servicer_admin` / `servicer_delegate` が各 1 件存在することを確認
- `@aws-sdk/client-cognito-identity-provider` のモックは不要（このハンドラーは Cognito を使わない）
- `createTenant.medium.test.ts` / `migrateAllTenants.medium.test.ts` の Testcontainers セットアップを参考にする

### サブタスク 4: `createTenant.ts` の `migrationsFolder` を env var 対応にする

**変更前後の対照表:**

| 項目 | 変更前 | 変更後 |
|---|---|---|
| ファイル | `apps/api/src/admin/createTenant.ts` | 同左 |
| 対象行 | `const migrationsFolder = path.join(__dirname, 'migrations-tenant');` | `const migrationsFolder = process.env['MIGRATIONS_TENANT_FOLDER'] ?? path.join(__dirname, 'migrations-tenant');` |

**注意:**
- Lambda 実行時は `MIGRATIONS_TENANT_FOLDER` 環境変数を設定しない（CDK の `afterBundling` が `migrations-tenant/` をコピーする既存の仕組みを継続）
- テスト実行時のみ `MIGRATIONS_TENANT_FOLDER=drizzle-tenant` を設定して実際の Drizzle マイグレーションファイルを指す

### サブタスク 5: `migrateAllTenants.ts` の `MIGRATIONS_FOLDER` を env var 対応にする

**変更前後の対照表:**

| 項目 | 変更前 | 変更後 |
|---|---|---|
| ファイル | `apps/api/src/admin/migrateAllTenants.ts` | 同左 |
| 対象行 | `const MIGRATIONS_FOLDER = path.join(__dirname, 'migrations-tenant');` | `const MIGRATIONS_FOLDER = process.env['MIGRATIONS_TENANT_FOLDER'] ?? path.join(__dirname, 'migrations-tenant');` |

### サブタスク 6: `createTenant.medium.test.ts` の migrate モックを外す

**変更前後の対照表:**

| 項目 | 変更前 | 変更後 |
|---|---|---|
| ファイル | `apps/api/src/admin/createTenant.medium.test.ts` | 同左 |
| `drizzle-orm/mysql2/migrator` の `migrate` | `vi.doMock('drizzle-orm/mysql2/migrator', ...)` でモック | モックを削除し、実際の `migrate` を使用 |
| `drizzle-orm/mysql2` の `drizzle` | `vi.doMock('drizzle-orm/mysql2', ...)` でモック | モックを削除し、実際の `drizzle` を使用 |
| `MIGRATIONS_TENANT_FOLDER` 環境変数 | 設定なし | `beforeAll` の先頭（または `vi.stubEnv`）で `process.env['MIGRATIONS_TENANT_FOLDER'] = 'drizzle-tenant'` を設定 |
| `getTenantDb` のモック | `mockGetTenantDb.mockResolvedValue(tenantDbStub)` でスタブ | テストコンテナの実 DB 接続を使う形に変更 |

**注意:**
- `mockDrizzle` / `mockMigrate` の宣言・doMock を削除する
- `beforeEach` の `mockMigrate.mockResolvedValue(undefined)` / `mockDrizzle.mockReturnValue({})` も削除する
- `getTenantDb` は `resolveDbCredentials` の接続情報を使う実装なら、モックを外してテストコンテナに接続させる

### サブタスク 7: `migrateAllTenants.medium.test.ts` の migrate モックを外す

**変更前後の対照表:**

| 項目 | 変更前 | 変更後 |
|---|---|---|
| ファイル | `apps/api/src/admin/migrateAllTenants.medium.test.ts` | 同左 |
| `drizzle-orm/mysql2/migrator` の `migrate` | `vi.doMock('drizzle-orm/mysql2/migrator', ...)` でモック | モックを削除し、実際の `migrate` を使用 |
| `drizzle-orm/mysql2` の `drizzle` | `vi.doMock('drizzle-orm/mysql2', ...)` でモック | モックを削除し、実際の `drizzle` を使用 |
| `MIGRATIONS_TENANT_FOLDER` 環境変数 | 設定なし | `beforeAll` の先頭で `process.env['MIGRATIONS_TENANT_FOLDER'] = 'drizzle-tenant'` を設定 |

**補足:** `resolveDbCredentials` はテストコンテナの接続情報を返すようモック済みなので、実際の `migrate` がテストコンテナに対して実行される。

### サブタスク 8: lint・型チェック最終確認

全サブタスク（#1〜7）完了後、`apps/api` で `npm run lint` を実行して警告・エラーがないことを確認する。

---

## 変更ファイル一覧

| 操作 | ファイルパス | 内容 |
|---|---|---|
| 更新 | `apps/api/src/admin/setupServiceSchema.ts` | roles シードを `INSERT IGNORE` raw SQL に変更 |
| 更新 | `apps/api/src/admin/setupServiceSchema.small.test.ts` | roles INSERT テストを `mockDbExecute` で確認するよう変更 |
| 新規 | `apps/api/src/admin/setupServiceSchema.medium.test.ts` | Testcontainers で冪等性を確認する medium テスト |
| 更新 | `apps/api/src/admin/createTenant.ts` | `migrationsFolder` を env var フォールバック対応 |
| 更新 | `apps/api/src/admin/migrateAllTenants.ts` | `MIGRATIONS_FOLDER` を env var フォールバック対応 |
| 更新 | `apps/api/src/admin/createTenant.medium.test.ts` | `migrate` モック削除・`MIGRATIONS_TENANT_FOLDER` 設定 |
| 更新 | `apps/api/src/admin/migrateAllTenants.medium.test.ts` | `migrate` モック削除・`MIGRATIONS_TENANT_FOLDER` 設定 |

---

## SubAgent 割り当て表

| # | サブタスク | SubAgent | 依存 |
|---|---|---|---|
| 1 | `setupServiceSchema.ts` roles シード冪等化 | tdd-implementer | なし |
| 2 | `setupServiceSchema.small.test.ts` テスト更新 | tdd-implementer | #1 |
| 3 | `setupServiceSchema.medium.test.ts` 新規作成 | tdd-implementer | #1 |
| 4 | `createTenant.ts` env var 対応 | tdd-implementer | なし |
| 5 | `migrateAllTenants.ts` env var 対応 | tdd-implementer | なし |
| 6 | `createTenant.medium.test.ts` migrate モック削除 | tdd-implementer | #4 |
| 7 | `migrateAllTenants.medium.test.ts` migrate モック削除 | tdd-implementer | #5 |
| 8 | lint・型チェック最終確認 | backend-engineer | #1〜7 |

---

## 完了条件チェックリスト

- [ ] `npm run test:small` — `setupServiceSchema.small.test.ts` が Green（`apps/api` で実行）
- [ ] `npm run test:medium` — `setupServiceSchema.medium.test.ts` が Green（Scenario A: 2 回実行で両方 200 OK）
- [ ] `npm run test:medium` — `createTenant.medium.test.ts` が Green（migrate のモックなしで通ること）
- [ ] `npm run test:medium` — `migrateAllTenants.medium.test.ts` が Green（migrate のモックなしで通ること）
- [ ] `npm run lint` が `apps/api` で通ること
- [ ] `docs/pbi/README.md` の該当 PBI を `✅ 完了` に更新すること
- [ ] ユーザーの承認を得てから完了とすること
