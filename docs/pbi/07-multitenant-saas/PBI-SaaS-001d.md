# PBI-SaaS-001d API 認可パターン設計 + 既存ドキュメント横断更新

親エピック: [PBI-SaaS-001](PBI-SaaS-001.md) / 作成日: 2026-06-17

---

## ユーザーストーリー

As a 開発者  
I want API レイヤーでのテナントコンテキスト取得・スキーマ接続切替・DB ベース認可チェックの代表パターンを確定し、既存設計ドキュメントを横断更新したい  
So that 全 API ハンドラーが同じパターンに従ってテナント境界を守る実装ができる

---

## 背景 / 目的

SaaS-001a（Cognito）・SaaS-001b（DB）・SaaS-001c（フロー）の設計が揃った後、
API レイヤーでこれらをどう組み合わせるかを「代表パターン」として設計する。
またこれまでの単一ユーザー前提で書かれた既存設計ドキュメントをマルチテナント対応に更新する。

以下の方針は確定済み（`auth-authz-design.md` 参照）:

- **API Gateway**: Cognito JWT Authorizer を使い、JWT 署名検証のみ担当。claims を Lambda コンテキストに渡す
- **Lambda 内フレームワーク**: Hono でルーティングとミドルウェアを集約する
- **認可 2 段構成**:
  - Tier 1 `tenantContext` ミドルウェア: テナントスラッグ解決（`tenant_*` は JWT / `servicer_*` は `X-Tenant-Id` ヘッダー）+ `service.user_tenant_roles` でアクセス可否確認
  - Tier 2 `requirePermission(resource, action)` ミドルウェア: `role_permissions` テーブルを参照した機能認可。`servicer_admin` はスキップ
- **フロントエンド**: `GET /api/my/permissions?tenant={slug}` でパーミッションリストを取得し、Pinia store で管理

---

## スコープ

### 含む

- `tenantContext` Hono ミドルウェアの設計
  - `tenant_*` ユーザー: JWT `custom:tenant_id` からテナントスラッグを解決し、`tenant_{slug}.users` で存在確認
  - `servicer_*` ユーザー: `X-Tenant-Id` ヘッダーからテナントスラッグを解決し、`service.user_tenant_roles` でアクセス可否確認
- `requirePermission(resource, action)` Hono ミドルウェアの設計（Tier 2 機能認可）
  - `service.role_permissions` または `tenant_{slug}.role_permissions` を参照
  - `servicer_admin` はスキップ
- 2 段構成認可モデル（Tier 1: テナントアクセス確認 / Tier 2: 機能認可）の代表フローとシーケンス図
- クロステナントアクセス拒否パターン（誤って他テナントのリソースにアクセスしようとした場合の 403）
- フロントエンド権限取得パターン（`GET /api/my/permissions?tenant={slug}` + Pinia store）
- ハンドラー実装例（`tenantContext` + `requirePermission` を組み合わせた薄いハンドラー）
- 既存設計ドキュメントの横断更新:
  - `docs/design/non-functional/security.md` — 認証・認可テーブルにテナント対応を追記
  - `docs/design/non-functional/api-architecture.md` — Hono ミドルウェアパターンをフローに追加
  - `docs/design/non-functional/infrastructure.md` — CDK スタック構成に Cognito JWT Authorizer を追記

### 含まない

- `getTenantContext` 関数の実装
- DB 認可チェックミドルウェアの実装
- Cognito Authorizer の CDK 実装

---

## ユースケース

### メイン（`tenant_*` ユーザー）

1. API リクエストが来たとき、Cognito JWT Authorizer が JWT を検証し、`custom:user_type` / `custom:tenant_id` をコンテキストに含めて Lambda に渡す
2. Hono の `tenantContext` ミドルウェアが JWT の `custom:tenant_id` からテナントスラッグを解決し、`tenant_{slug}.users` で存在確認する
3. `requirePermission(resource, action)` ミドルウェアが `tenant_{slug}.role_permissions` を参照して機能認可を判定する
4. 認可 OK の場合のみハンドラーを実行し、レスポンスを返す

### メイン（`servicer_*` ユーザー）

1. Cognito JWT Authorizer が JWT を検証し、`custom:user_type` をコンテキストに含めて Lambda に渡す（`custom:tenant_id` なし）
2. `tenantContext` ミドルウェアが `X-Tenant-Id` ヘッダーからテナントスラッグを解決する
3. `service.user_tenant_roles` でこのユーザーが対象テナントにアクセスできるか確認する（Tier 1）
4. `servicer_admin` は Tier 2 をスキップし、直接ハンドラーを実行する
5. `servicer_delegate` は `service.role_permissions` を参照して機能認可を判定する（Tier 2）

### 例外

- `tenant_*` の JWT に `custom:tenant_id` がない → 403 Forbidden
- `servicer_*` のリクエストに `X-Tenant-Id` ヘッダーがない → 400 Bad Request
- テナントスキーマが存在しない → 503 Service Unavailable（プロビジョニング未完了）
- Tier 1: テナントアクセス不可 → 403 Forbidden（テナントアクセス拒否）
- Tier 2: 権限なし → 403 Forbidden（権限不足）

---

## 受け入れ条件（Gherkin）

```gherkin
Scenario 1: `tenantContext` ミドルウェアパターンの確定
  Given API 認可パターン設計ドキュメントが存在する
  When `tenantContext` ミドルウェアの設計を確認したとき
  Then `tenant_*` ユーザーは JWT `custom:tenant_id` からテナントスラッグを解決するパターンが定義されていること
  And  `servicer_*` ユーザーは `X-Tenant-Id` ヘッダーからテナントスラッグを解決し `service.user_tenant_roles` で確認するパターンが定義されていること
  And  テナントスラッグ未解決時に 400 または 403 を返すパターンが明記されていること
  And  Hono context（`c.get('tenantDb')` 等）へのセットが示されていること

Scenario 2: `requirePermission` ミドルウェアパターンの確定
  Given API 認可パターン設計ドキュメントが存在する
  When `requirePermission(resource, action)` の設計を確認したとき
  Then `resource` × `action` の組み合わせで `role_permissions` を参照するパターンが定義されていること
  And  `servicer_admin` は Tier 2 をスキップすることが明記されていること
  And  認可失敗時に 403 を返すパターンが示されていること
  And  Cognito `custom:user_type` と DB の `role_permissions` の参照順序・使い分けが明記されていること

Scenario 3: クロステナントアクセス拒否パターンの確定
  Given API 認可パターン設計ドキュメントが存在する
  When クロステナントアクセス拒否パターンを確認したとき
  Then DB アクセス時にテナントスキーマ境界を超えない接続切替方式が定義されていること
  And  `tenant_*` ユーザーの JWT `custom:tenant_id` と `X-Tenant-Id` ヘッダーの不一致を 403 で拒否するパターンが示されていること

Scenario 4: ハンドラー実装例の確定
  Given API 認可パターン設計ドキュメントが存在する
  When ハンドラー実装例を確認したとき
  Then `app.post('/residents', tenantContext, requirePermission('resident', 'create'), handler)` のような薄いハンドラー例が示されていること
  And  ハンドラーが `c.get('tenantDb')` 経由でテナント DB 接続を取得するパターンが示されていること

Scenario 5: security.md の横断更新
  Given `docs/design/non-functional/security.md` が更新されている
  When 認証・認可テーブルを確認したとき
  Then 認証フェーズに「Cognito JWT Authorizer + テナントコンテキスト解決」が追記されていること
  And  認可フェーズに「Tier 1: テナントアクセス確認」と「Tier 2: resource × action ホワイトリスト」が追記されていること
  And  `## 変更履歴` に PBI-SaaS-001d の変更内容が記録されていること

Scenario 6: api-architecture.md の横断更新
  Given `docs/design/non-functional/api-architecture.md` が更新されている
  When 代表パターンを確認したとき
  Then 「Cognito JWT Authorizer → `tenantContext` → `requirePermission` → ハンドラー」の代表パターンが追加されていること
  And  `getOwnerId` パターンから Hono ミドルウェアパターンへの移行経路が示されていること
  And  `## 変更履歴` に PBI-SaaS-001d の変更内容が記録されていること

Scenario 7: infrastructure.md の横断更新
  Given `docs/design/non-functional/infrastructure.md` が更新されている
  When CDK スタック構成を確認したとき
  Then Cognito User Pool / Cognito JWT Authorizer がスタック構成表に追記されていること
  And  `## 変更履歴` に PBI-SaaS-001d の変更内容が記録されていること
```

---

## ルール（Example Mapping）

- **Rule 1: `tenantContext` ミドルウェアは全認証済みエンドポイントで必ず適用する**
  - Example: `app.post('/residents', tenantContext, requirePermission(...), handler)` のように先頭でミドルウェアを適用する。直接 `event.requestContext.authorizer` をハンドラーで参照しない

- **Rule 2: DB 認可チェックは `custom:user_type` の補完として位置づける**
  - Example: `custom:user_type: "tenant_admin"` は「ユーザー管理が可能」という粗い判定に使う。「シミュレーションを実行できるか」など機能固有の判定は必ず `role_permissions` テーブルを参照する

- **Rule 3: 接続切替後のスキーマ外アクセスは設計レベルで排除する**
  - Example: Drizzle の接続を切り替えた後は、そのセッション内でテナントスキーマ外のテーブルを参照するコードを書かない

- **Rule 4: `servicer_admin` は Tier 2 をスキップし全権限で操作できる**
  - Example: `tenantContext` でテナントアクセス（Tier 1）が確認されれば、`requirePermission` を通過させる。設計ドキュメントにその根拠（サービス全体を管理する立場のため）を記載する

- **Rule 5: 既存ドキュメントの `getOwnerId` パターンを Hono ミドルウェアパターンへ段階移行させる**
  - Example: 実装 PBI が進む中で `getOwnerId` は `tenantContext` ミドルウェアの context から `userId` を取り出す形に置き換える。設計ドキュメントにその移行経路を記載する

---

## 不明点 / 質問

- DB 認可チェックの結果をリクエスト内でキャッシュするか（Lambda ウォームスタート時の再参照を避けるか）？
- `GET /api/my/permissions` のレスポンスキャッシュ方針（フロントエンド側でのキャッシュ有効期限）？

## 確定済み事項（設計検討で解決済み）

| # | 内容 | 決定内容 |
|---|---|---|
| 1 | API Gateway Authorizer の方式 | **Cognito JWT Authorizer**（API Gateway レベルで JWT 検証）。Lambda 内での追加検証は不要 |
| 2 | Lambda 内フレームワーク | **Hono**。`tenantContext` + `requirePermission` ミドルウェアで認可を集約する |

---

## INVEST チェック

- **Independent**: NG — SaaS-001a（Cognito / claim 定義）・SaaS-001b（DB / 認可テーブル設計）が完了してから着手する。Authorizer 方式（Cognito JWT Authorizer）と Hono 採用は確定済みのため、それ以外の依存のみ残る
- **Negotiable**: OK — DB 認可キャッシュの有無・フロントエンドキャッシュ方針は交渉余地あり
- **Valuable**: OK — このパターンが確定しないと全 API ハンドラーの実装 PBI が定義できない
- **Estimable**: OK — 成果物が「API パターン設計ドキュメント + 既存 3 ドキュメントの横断更新」と明確
- **Small**: OK — 設計ドキュメント作成 + 既存ドキュメント更新のみ
- **Testable**: OK — 各受け入れ条件がドキュメントの記載内容で検証可能
