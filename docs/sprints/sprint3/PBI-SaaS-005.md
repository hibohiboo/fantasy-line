# PBI-SaaS-005 作業計画 — テナントプロビジョニング Lambda 実装

Sprint 3 / 作成日: 2026-06-21

**想定読者**: 実装 SubAgent・実装担当者  
**目的**: PBI-SaaS-005 実装で必要なファイル配置・変更箇所・SubAgent 割り当てを記録する。  
**スコープ**: adminContext ミドルウェア・管理 Lambda ハンドラー群・CDK 更新・ユニットテスト・統合テスト・本番 DB 操作手順追記。フロントエンド画面・テナント内ユーザー管理は含まない。

設計の根拠は [tenant-provisioning.md](../../design/non-functional/tenant-provisioning.md) を参照。

---

## 前提・依存関係

- **PBI-SaaS-002 完了済み**: Cognito CDK（User Pool・Authorizer）が存在すること
- **PBI-SaaS-003 完了済み**: `apps/api/drizzle-service/` と `apps/api/drizzle-tenant/` が存在すること
- **PBI-SaaS-004 / 004b 完了済み**: Hono + `tenantContext` + `requirePermission` ミドルウェアが存在すること
- ローカル: Docker MySQL が起動済みであること（`apps/api` から `npm run db:up`）
- Lambda ランタイム: Node.js 24.x（`@aws-sdk/*` はランタイム同梱のため devDependencies に追加するが本番バンドルには含めない）

---

## 実装仕様

### サブタスク 1: `adminContext` ミドルウェア

**概要**: 管理 API 専用の認証ミドルウェア。既存の `tenantContext` は `X-Tenant-Id` 必須のためテナント非選択の管理 API には使えない。専用ミドルウェアを新規作成する。

**配置先**: `apps/api/src/admin/adminContext.ts`

| 項目 | 内容 |
|---|---|
| 入力 | Lambda event の JWT claims（`event.requestContext.authorizer.jwt.claims`） |
| 処理 | `custom:user_type === 'servicer_admin'` を確認し、`service` DB から userId を取得してコンテキストにセット |
| 失敗時 | 403 Forbidden |
| 型 | `tenantDb` / `tenantSlug` は不要。専用の `AdminVariables` 型を定義する |

`AdminVariables` 型定義:

```ts
type AdminVariables = {
  userId: number;     // service.users.id
  cognitoSub: string; // JWT sub
};
```

### サブタスク 2: `setupServiceSchema` ハンドラー

**概要**: `POST /admin/setup/service-schema` — Aurora 本番環境の service スキーマ初期構築（冪等）

**配置先**: `apps/api/src/admin/setupServiceSchema.ts`

| 項目 | 内容 |
|---|---|
| 処理順序 | 1. Aurora に `CREATE DATABASE IF NOT EXISTS \`service\`` 2. `drizzle-service/` マイグレーション適用 3. `service.roles` / `service.role_permissions` を `INSERT IGNORE` でシード（冪等） |
| 成功レスポンス | 200 OK `{ "message": "service schema initialized" }` |
| 認可 | `adminContext` で `servicer_admin` のみ許可 |
| bundling | `drizzle-service/` マイグレーションファイルを Lambda バンドルに含める（CDK の `afterBundling` フックで対応） |

### サブタスク 3: `createTenant` ハンドラー

**概要**: `POST /admin/tenants` — テナント発行（8 ステップ + サガパターンロールバック）

**配置先**: `apps/api/src/admin/createTenant.ts`

| 項目 | 内容 |
|---|---|
| リクエスト | `{ slug: string, name: string, adminEmail: string }` |
| バリデーション | `slug`: `validateSlug()` 使用、`adminEmail`: Zod email |
| 処理順序 | 1. slug 重複確認（409 Conflict） 2. `service.tenants` 登録 3. `CREATE DATABASE tenant_{slug}` 4. `drizzle-tenant/` マイグレーション適用 5. `service.role_permissions` → `tenant_{slug}.role_permissions` シード 6. Cognito `AdminCreateUser`（`custom:user_type=tenant_admin`, `custom:tenant_id=slug`） 7. 招待メール送信（Cognito `inviteMessageTemplate`） 8. `tenant_{slug}.users` に初期管理者登録 |
| ロールバック | サガパターン。各ステップ失敗時に逆順クリーンアップ |
| 成功レスポンス | 201 Created `{ "tenant": { "id": ..., "slug": "...", "name": "...", "status": "..." } }` |
| エラー | スキーマ作成失敗→500、シード失敗→500、Cognito 失敗→500（いずれもロールバック後） |
| Cognito SDK | `@aws-sdk/client-cognito-identity-provider` の `AdminCreateUser` コマンドを使用 |
| 環境変数 | `COGNITO_USER_POOL_ID` |

サガパターンのイメージ:

```ts
type SagaStep<T> = {
  execute: () => Promise<T>;
  rollback: (result: T) => Promise<void>;
};
async function runSaga(steps: SagaStep<unknown>[]): Promise<void>
```

### サブタスク 4: `migrateAllTenants` ハンドラー

**概要**: `POST /admin/migrate/all-tenants` — 全テナントマイグレーション（1 テナント失敗でも続行）

**配置先**: `apps/api/src/admin/migrateAllTenants.ts`

| 項目 | 内容 |
|---|---|
| 処理 | `service.tenants` から active スラッグを取得 → 各テナントに `drizzle-tenant/` マイグレーション適用 |
| 失敗時 | 失敗テナントをスキップして続行。最終結果を CloudWatch Logs に出力 |
| 全成功レスポンス | 200 OK `{ "success": N, "failed": [] }` |
| 一部失敗レスポンス | 207 Multi-Status `{ "success": N, "failed": ["slug1", ...] }` |
| bundling | `drizzle-tenant/` マイグレーションファイルを Lambda バンドルに含める（CDK の `afterBundling` フックで対応） |

### サブタスク 5: `createServicerDelegate` ハンドラー

**概要**: `POST /admin/users` — `servicer_delegate` 作成

**配置先**: `apps/api/src/admin/createServicerDelegate.ts`

| 項目 | 内容 |
|---|---|
| リクエスト | `{ email: string, tenantIds: number[] }` |
| 処理 | 1. Cognito `AdminCreateUser`（`custom:user_type=servicer_delegate`、`custom:tenant_id` は設定しない） 2. `service.users` 登録 3. `service.user_tenant_roles` 設定 |
| 成功レスポンス | 201 Created `{ "user": { "id": ..., "email": "...", "userType": "servicer_delegate" } }` |

### サブタスク 6: 管理 Lambda エントリポイント

**配置先**: `apps/api/src/admin/admin-lambda.ts`

| 項目 | 内容 |
|---|---|
| フレームワーク | Hono（`handle()` で Lambda ハンドラーに変換） |
| ルーティング | `POST /admin/setup/service-schema`、`POST /admin/tenants`、`POST /admin/migrate/all-tenants`、`POST /admin/users` |
| 認可 | 全ルートに `adminContext` を適用（`servicer_admin` 専用） |

### サブタスク 7: CDK 更新

**対象ファイル**: `infra/lib/infra-stack.ts`

| 項目 | 内容 |
|---|---|
| 追加リソース | `AdminFunction`（`NodejsFunction`）— entry: `apps/api/src/admin/admin-lambda.ts` |
| 環境変数 | `DB_SECRET_ARN`（既存踏襲）+ `COGNITO_USER_POOL_ID`（追加） |
| IAM 権限 | `auroraCluster.secret.grantRead(adminFunction)` + `cognitoConstruct.userPool.grant(adminFunction, 'cognito-idp:AdminCreateUser')` |
| API Gateway | `api.root.addResource('admin')` で `admin` リソースを追加し、各エンドポイントに Cognito Authorizer を設定 |
| cdk-nag | 既存 suppression パターンを踏襲 |
| bundling | `drizzle-service/` + `drizzle-tenant/` を `afterBundling` フックでバンドルに含める |

### サブタスク 8: ユニットテスト（small）

各ハンドラーの small テスト（Vitest + `vi.fn` スタブ）:

| テストファイル | 確認内容 |
|---|---|
| `adminContext.small.test.ts` | `servicer_admin` 許可、それ以外 403 |
| `setupServiceSchema.small.test.ts` | 冪等性（2 回実行で同結果）、DB 接続エラー時の 500 |
| `createTenant.small.test.ts` | 正常系（201）、重複スラッグ（409）、各ステップ失敗時のロールバック確認（500）、`servicer_admin` 以外は 403 |
| `migrateAllTenants.small.test.ts` | 全成功（200）、一部失敗（207） |
| `createServicerDelegate.small.test.ts` | 正常系（201） |

### サブタスク 9: 統合テスト（medium）

Testcontainers（Docker MySQL）+ Cognito SDK モックを使った medium テスト:

| テストファイル | 確認内容 |
|---|---|
| `createTenant.medium.test.ts` | 実際の DB に対してテナント発行フロー全体（Cognito は `vi.fn` モック）。Scenario 1〜4 を検証 |
| `migrateAllTenants.medium.test.ts` | 実際の DB に対して全テナントマイグレーション。Scenario 0b を検証 |

既存の `apps/api/src/shared/test-helpers/mediumTestSetup.ts` を参考にする。管理テスト用セットアップヘルパーが必要な場合はサブタスク 11 で対応する。

### サブタスク 10: `db-operations.md` 本番手順追記

`docs/design/non-functional/db-operations.md` に本番 Aurora での以下 3 手順を追記する。

- service スキーマ初期構築（`POST /admin/setup/service-schema`）
- テナント発行手順（`POST /admin/tenants`）
- 全テナントマイグレーション（`POST /admin/migrate/all-tenants`）

詳細は各ハンドラー実装仕様（サブタスク 2〜4）が確定した後に文書化する。

### サブタスク 11: テストリファクタリング

small / medium テストが 5 ファイル以上になるため、全実装サブタスク完了後に共通ボイラープレートを抽出する。

- 重複している `beforeAll` / `beforeEach` パターンを確認する
- `makeMockEvent` のような共通ヘルパーが各ファイルに個別定義されていないか確認する
- 3 ファイル以上で重複するセットアップは `apps/api/src/shared/test-helpers/adminTestSetup.ts` に集約する
- 抽出後も各テストファイル内で「何をテストするか」が読める状態（DAMP 原則）を保つ

---

## 変更ファイル一覧

| 操作 | ファイルパス | 内容 |
|---|---|---|
| 新規 | `apps/api/src/admin/adminContext.ts` | `servicer_admin` 専用ミドルウェア |
| 新規 | `apps/api/src/admin/setupServiceSchema.ts` | service スキーマ初期構築ハンドラー |
| 新規 | `apps/api/src/admin/createTenant.ts` | テナント発行ハンドラー（サガパターン） |
| 新規 | `apps/api/src/admin/migrateAllTenants.ts` | 全テナントマイグレーションハンドラー |
| 新規 | `apps/api/src/admin/createServicerDelegate.ts` | `servicer_delegate` 作成ハンドラー |
| 新規 | `apps/api/src/admin/admin-lambda.ts` | Hono エントリポイント |
| 新規 | `apps/api/src/admin/adminContext.small.test.ts` | `adminContext` small テスト |
| 新規 | `apps/api/src/admin/setupServiceSchema.small.test.ts` | `setupServiceSchema` small テスト |
| 新規 | `apps/api/src/admin/createTenant.small.test.ts` | `createTenant` small テスト |
| 新規 | `apps/api/src/admin/migrateAllTenants.small.test.ts` | `migrateAllTenants` small テスト |
| 新規 | `apps/api/src/admin/createServicerDelegate.small.test.ts` | `createServicerDelegate` small テスト |
| 新規 | `apps/api/src/admin/createTenant.medium.test.ts` | `createTenant` medium テスト（Scenario 1〜4） |
| 新規 | `apps/api/src/admin/migrateAllTenants.medium.test.ts` | `migrateAllTenants` medium テスト（Scenario 0b） |
| 更新 | `infra/lib/infra-stack.ts` | 管理 Lambda + API Gateway エンドポイント追加 |
| 更新 | `apps/api/package.json` | `@aws-sdk/client-cognito-identity-provider` を devDependencies に追加 |
| 更新 | `docs/design/non-functional/db-operations.md` | 本番 Aurora 手順セクション追記 |

---

## SubAgent 割り当て表

| # | サブタスク | SubAgent | 依存 |
|---|---|---|---|
| 1 | `adminContext` ミドルウェア（small テスト含む） | tdd-implementer | なし |
| 2 | `setupServiceSchema` ハンドラー（small テスト含む） | tdd-implementer | #1 |
| 3 | `createTenant` ハンドラー（small テスト含む） | tdd-implementer | #1 |
| 4 | `migrateAllTenants` ハンドラー（small テスト含む） | tdd-implementer | #1 |
| 5 | `createServicerDelegate` ハンドラー（small テスト含む） | tdd-implementer | #1 |
| 6 | `admin-lambda.ts` エントリポイント | backend-engineer | #1〜5 |
| 7 | medium テスト実装（`createTenant` / `migrateAllTenants`） | test-engineer | #2〜5 |
| 8 | CDK 更新（管理 Lambda + API Gateway） | aws-cdk-engineer | #6 |
| 9 | `db-operations.md` 本番手順追記 | documentation-coauthor | #2〜5 実装仕様確定後 |
| 10 | テストリファクタリング（共通ボイラープレート抽出） | backend-engineer | 全実装サブタスク完了後 |

---

## 完了条件チェックリスト

- [ ] `npm run test:small` — 全 small テストが Green（`apps/api` で実行）
- [ ] `npm run test:medium` — 全 medium テストが Green（`apps/api` で実行）
- [ ] `npm run lint` が `apps/api` で通ること
- [ ] `cdk synth` がエラーなしで通ること（`infra` ディレクトリで実行）
- [ ] `POST /admin/tenants` の Scenario 1〜4（PBI-SaaS-005 受け入れ条件）が medium テストで確認済み
- [ ] `POST /admin/users` の Scenario 5 が medium テストで確認済み
- [ ] `POST /admin/setup/service-schema` の Scenario 0 が medium テストで確認済み
- [ ] `POST /admin/migrate/all-tenants` の Scenario 0b が medium テストで確認済み
- [ ] `docs/design/non-functional/db-operations.md` に本番 Aurora 手順（service スキーマ初期構築・テナント発行・全テナントマイグレーション）が追記済み
- [ ] テスト重複レビューを実施し、3 ファイル以上の共通ボイラープレートは共通ヘルパーに抽出されていること
- [ ] テストリファクタリング後も `npm run test` が全件 Green で通ること
- [ ] `docs/pbi/README.md` の該当 PBI を `✅ 完了` に更新すること
- [x] ユーザーの承認を得てから完了とすること

---

## 未解決事項（次 PBI への引き継ぎ）

実装中に判明した制約・リスクを記録する。対応は [PBI-SaaS-005b](../../pbi/07-multitenant-saas/PBI-SaaS-005b.md) で行う。

### 1. `setupServiceSchema` の roles シードが冪等でない

**現状**: `setupServiceSchema.ts` の roles シードが `db.insert(serviceRoles).values(...)` （Drizzle 標準 INSERT）で実装されており、重複行が存在すると `ER_DUP_ENTRY` エラーになる。

**リスク**: `POST /admin/setup/service-schema` を 2 回以上呼んだとき（冪等性が破れる）。PBI-SaaS-005 の Scenario 0「2 回実行しても同じ結果が返ること」に違反する。

**対処方針**: `INSERT IGNORE INTO roles ...` の raw SQL に置き換える（`db.execute(sql\`INSERT IGNORE ...\`)` パターン）。`role_permissions` のシードは既に raw SQL で実装済み。

### 2. medium テストの `migrate` がパス問題でモック化されている

**現状**: `createTenant.medium.test.ts` と `migrateAllTenants.medium.test.ts` の `drizzle-orm/mysql2/migrator` の `migrate` を `vi.fn()` でモックしている。

**理由**: Lambda バンドル時に CDK の `afterBundling` フックが `drizzle-tenant/` を `migrations-tenant/` にコピーするが、テスト環境（`src/admin/` 直下の `__dirname`）ではそのフォルダが存在しないため。

**リスク**: 実際の Drizzle マイグレーション適用が medium テストで検証されておらず、マイグレーションファイルの構文エラーが本番デプロイまで発覚しない。

**対処方針**: テスト用に `MIGRATIONS_FOLDER` を環境変数で上書きできるよう `migrateAllTenants.ts` / `createTenant.ts` をリファクタリングし、medium テストでは `process.cwd() + '/drizzle-tenant'` を指すよう設定する。
