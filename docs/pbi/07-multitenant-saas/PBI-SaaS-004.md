# PBI-SaaS-004 Hono + tenantContext + requirePermission ミドルウェア実装

親エピック: [PBI-SaaS-001](PBI-SaaS-001.md) / 作成日: 2026-06-17

---

## ユーザーストーリー

As a バックエンド開発者  
I want Hono フレームワークと `tenantContext` / `requirePermission` ミドルウェアを実装したい  
So that 全 API ハンドラーが同じパターンに従ってテナント境界を守る実装ができる

---

## 背景 / 目的

[api-authz-multitenant.md](../../design/non-functional/api-authz-multitenant.md) で確定した設計を実装する。
Hono を Lambda に導入し、`tenantContext`（Tier 1: テナントアクセス確認）と
`requirePermission(resource, action)`（Tier 2: 機能認可）ミドルウェアを作成する。
代表ハンドラー 1 本（`listVillages`）を Hono + ミドルウェアパターンに移行し、動作を検証する。

---

## スコープ

### 含む

- Hono の `apps/api` への導入
- `apps/api/src/shared/middleware/tenantContext.ts` の実装
  - `tenant_*` ユーザー: JWT `custom:tenant_id` → `slugToSchemaName()` → `tenant_{slug}.users` 存在確認 → Hono context セット
  - `servicer_*` ユーザー: `X-Tenant-Id` ヘッダー → `service.user_tenant_roles` 確認 → Hono context セット
  - エラーハンドリング（400 / 403 / 503）
- `apps/api/src/shared/middleware/requirePermission.ts` の実装
  - `tenant_{slug}.role_permissions`（`resource` × `action`）参照
  - `servicer_admin` のスキップ処理
- 代表ハンドラー 1 本（`listVillages`）を Hono + ミドルウェアパターンに移行
- ユニットテスト（`tenantContext` / `requirePermission` の各条件）
- 統合テスト（ローカル Docker MySQL + 代表ハンドラー）

### 含まない

- 全ハンドラーの Hono 移行（段階的に後続 PBI で行う）
- ユーザー管理 API（→ PBI-SaaS-006）
- フロントエンド（→ PBI-SaaS-007）

---

## ユースケース

### メイン（`tenant_*` ユーザー）

1. JWT に `custom:user_type: "tenant_user"` と `custom:tenant_id: "acme"` が含まれる
2. `tenantContext` が `tenant_acme.users` でユーザー存在確認を行い、`c.set('tenantDb', ...)` 等をセットする
3. `requirePermission('village', 'read')` が `tenant_acme.role_permissions` を確認して通過させる
4. ハンドラーが `c.get('tenantDb')` を使い `tenant_acme` スキーマのデータを取得して返す

### メイン（`servicer_admin`）

1. JWT に `custom:user_type: "servicer_admin"` が含まれ、`X-Tenant-Id: acme` ヘッダーがある
2. `tenantContext` が `service.user_tenant_roles` で確認し、`c.set('tenantDb', ...)` をセットする
3. `requirePermission` が `servicer_admin` を検出してスキップする
4. ハンドラーが実行される

### 例外

- `custom:user_type` が想定 4 値以外 → 403 Forbidden
- `tenant_*` の JWT に `custom:tenant_id` がない → 403 Forbidden
- `servicer_*` に `X-Tenant-Id` ヘッダーがない → 400 Bad Request
- テナントスキーマが存在しない → 503 Service Unavailable
- Tier 1: テナントアクセス不可 → 403 Forbidden
- Tier 2: 権限なし → 403 Forbidden

---

## 受け入れ条件（Gherkin）

```gherkin
Scenario 1: `tenant_*` ユーザーが正しくテナントコンテキストを解決できること
  Given JWT に `custom:user_type: "tenant_user"` と `custom:tenant_id: "acme"` が含まれている
  And   `tenant_acme.users` にそのユーザーのレコードが存在する
  When  `tenantContext` ミドルウェアが実行されたとき
  Then  `c.get('tenantDb')` が `tenant_acme` スキーマへの接続を返すこと
  And   `c.get('tenantSlug')` が "acme" を返すこと
  And   `c.get('userId')` が対象ユーザーの DB ID を返すこと

Scenario 2: `servicer_admin` が `X-Tenant-Id` からテナントを解決できること
  Given JWT に `custom:user_type: "servicer_admin"` が含まれている
  And   リクエストヘッダーに `X-Tenant-Id: acme` がある
  And   `service.user_tenant_roles` にそのユーザーとテナントのレコードが存在する
  When  `tenantContext` ミドルウェアが実行されたとき
  Then  `c.get('tenantDb')` が `tenant_acme` スキーマへの接続を返すこと

Scenario 3: `X-Tenant-Id` ヘッダーがない `servicer_*` は 400 を返すこと
  Given JWT に `custom:user_type: "servicer_delegate"` が含まれている
  And   リクエストヘッダーに `X-Tenant-Id` がない
  When  `tenantContext` ミドルウェアが実行されたとき
  Then  400 Bad Request が返ること

Scenario 4: テナントアクセス権がない `servicer_delegate` は 403 を返すこと
  Given JWT に `custom:user_type: "servicer_delegate"` が含まれている
  And   リクエストヘッダーに `X-Tenant-Id: acme` がある
  And   `service.user_tenant_roles` にそのユーザーとテナント "acme" のレコードが存在しない
  When  `tenantContext` ミドルウェアが実行されたとき
  Then  403 Forbidden が返ること

Scenario 5: `requirePermission` が権限のないユーザーを 403 で拒否すること
  Given `c.get('userType')` が "tenant_user" である
  And   `tenant_acme.role_permissions` に resource='user', action='delete' の権限が存在しない
  When  `requirePermission('user', 'delete')` ミドルウェアが実行されたとき
  Then  403 Forbidden が返ること

Scenario 6: `servicer_admin` が `requirePermission` をスキップできること
  Given `c.get('userType')` が "servicer_admin" である
  When  `requirePermission('user', 'delete')` ミドルウェアが実行されたとき
  Then  ミドルウェアがスキップされ next() が呼ばれること

Scenario 7: 代表ハンドラーが Hono + ミドルウェアパターンで動作すること
  Given 認証済み `tenant_user` のリクエストがある
  When  GET /api/villages にリクエストを送ったとき
  Then  200 OK でそのテナントの村一覧が返ること
  And   他テナントの村データが含まれないこと
```

---

## ルール（Example Mapping）

- **Rule 1: 全ての認証済みエンドポイントで `tenantContext` を先頭に適用する**
  - Example: `app.post('/villages', tenantContext, requirePermission('village', 'create'), handler)` のように先頭でミドルウェアを適用する。ハンドラー内で直接 JWT を参照しない

- **Rule 2: ハンドラーは `c.get('tenantDb')` のみで DB 接続を取得する**
  - Example: ハンドラー内で直接 DB 接続を生成しない。`tenantContext` がセットした `tenantDb` を常に使う

- **Rule 3: `servicer_admin` は Tier 2 をスキップし全権限を持つ**
  - Example: `requirePermission` の先頭で `c.get('userType') === 'servicer_admin'` を確認し、`return next()` を返す

---

## 不明点 / 質問

なし（設計ドキュメントで確定済み）

---

## INVEST チェック

- **Independent**: NG — PBI-SaaS-002（Cognito CDK）と PBI-SaaS-003（DB マイグレーション）の完了後に着手
- **Negotiable**: OK — 移行する代表ハンドラーの選定・Hono の導入方式は交渉余地あり
- **Valuable**: OK — このパターンなしでは安全なマルチテナント API を実装できない
- **Estimable**: OK — Hono + ミドルウェアパターンは設計ドキュメントで詳細化済み
- **Small**: OK — ミドルウェア実装 + 代表ハンドラー 1 本の移行
- **Testable**: OK — ユニットテスト + 統合テスト（ローカル Docker MySQL）で検証可能
