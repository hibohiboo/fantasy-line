# PBI-SaaS-001b DB スキーマ per テナント設計（命名規則・接続切替・認可テーブル）

親エピック: [PBI-SaaS-001](PBI-SaaS-001.md) / 作成日: 2026-06-17

---

## ユーザーストーリー

As a 開発者  
I want Aurora MySQL 上のスキーマ per テナント構成・Drizzle ORM での接続切替方式・テナント内認可テーブルの設計を確定したい  
So that テナント間のデータ混在を防ぎつつ、将来テナントごとの認可設定変更に耐える DB 設計を実装できる

---

## 背景 / 目的

Aurora MySQL の共有クラスター上でテナントごとにスキーマ（MySQL では Database）を分けることで、
コストを抑えながらデータ分離を実現する。

スキーマは 3 種類構成とする。
- `service`: サービサー側ユーザー（`servicer_admin` / `servicer_delegate`）の管理・全テナント一覧・サービサー側の認可テーブルとデフォルトパーミッション定義
- `common`: 全テナントから参照可能な共通マスタデータ（具体的テーブルは DB 設計 PBI で確定）
- `tenant_{slug}`: テナント固有のビジネスデータ・テナント側ユーザー・認可テーブル

また、Cognito の `custom:user_type` だけでは将来の機能認可要件に対応できないため、
各テナントスキーマ内に拡張可能な認可テーブル（roles / user_roles / role_permissions）を設計する。
パーミッションは `role_permissions.resource` × `role_permissions.action` で直接表現し、独立した permissions テーブルは置かない。
テナントプロビジョニング時に `service.role_permissions` の内容を各 `tenant_{slug}.role_permissions` にシードする。

---

## スコープ

### 含む

- スキーマ命名規則（`tenant_{slug}` 形式の定義・スラッグ文字種との対応）
- `service` スキーマ設計（`users`・`tenants`・`roles`・`user_tenant_roles`・`role_permissions`）
- `common` スキーマ設計方針（具体的テーブルは DB 設計 PBI で確定。方針のみ明記）
- `tenant_{slug}` スキーマ設計（`users`・`roles`・`user_roles`・`role_permissions` + ビジネスデータ）
- Drizzle ORM での接続切替設計（リクエストごとにスキーマを切り替える方式）
- スキーマ作成・削除の操作手順定義（テナントプロビジョニング時・解約時）
- 全テナント一括マイグレーション運用方針（Drizzle migrate の実行単位・順序）
- 認可テーブル設計（`role_permissions` は `resource` × `action` で直接表現。独立した `permissions` テーブルは置かない）
- テナントプロビジョニング時に `service.role_permissions` から各テナントへシードする方針
- 既存 `owner_id` カラムの扱い方針（維持 or 廃止の決定と移行方針）
- テナント管理台帳（`service.tenants` テーブル）の設計

### 含まない

- スキーマ作成マイグレーションの実装
- Drizzle ORM 接続切替の実装
- テナント内認可テーブルの初期データ投入実装
- Cognito 設計（→ PBI-SaaS-001a）

---

## ユースケース

### メイン

1. テナント `acme` が発行されると、`service.tenants` に登録され、`tenant_acme` スキーマが Aurora MySQL 上に作成される
2. `tenant_acme` のプロビジョニング時に `service.role_permissions` の内容が `tenant_acme.role_permissions` にシードされる
3. `tenant_*` ユーザーの API リクエストが来たとき、JWT の `custom:tenant_id`（`"acme"`）から `tenant_acme` スキーマへの接続に切り替わる
4. `servicer_*` ユーザーの API リクエストが来たとき、`X-Tenant-Id` ヘッダーから対象テナントのスキーマへの接続に切り替わる（`service.user_tenant_roles` でアクセス可否を確認後）
5. 機能認可チェック時に、`tenant_acme.user_roles` と `tenant_acme.role_permissions`（`resource` × `action`）を参照する
6. スキーマ変更（Drizzle マイグレーション）が発生したとき、`service.tenants` から全スキーマ名を取得し順次適用する

### 例外

- 存在しないスキーマへの接続試行 → 503 を返し、アラートを発報する
- マイグレーション中に一部テナントで失敗 → 失敗テナントをログに記録し、成功済みテナントはロールバックしない（冪等マイグレーション前提）

---

## 受け入れ条件（Gherkin）

```gherkin
Scenario 1: スキーマ命名規則の確定
  Given DB 設計ドキュメントが存在する
  When スキーマ命名規則を確認したとき
  Then `tenant_{slug}` 形式であることが定義されていること
  And  スラッグに使用できる文字種（PBI-SaaS-001a の定義と一致）が明記されていること
  And  スキーマ名の最大長が MySQL の制約（64文字）内に収まることが確認されていること

Scenario 2: Drizzle ORM 接続切替設計の確定
  Given 接続切替設計ドキュメントが存在する
  When 接続切替のタイミングと方式を確認したとき
  Then JWT の `custom:tenant_id` からスキーマ名を導出する手順が定義されていること
  And  Lambda 実行コンテキスト内での接続切替タイミングが定義されていること
  And  接続方式が「1 リクエスト 1 接続」（接続プール不使用）と明記されていること

Scenario 3: `service` スキーマ設計の確定
  Given DB 設計ドキュメントが存在する
  When `service` スキーマのテーブル定義を確認したとき
  Then `service.users`（id, cognito_sub, email, user_type: 'servicer_admin' | 'servicer_delegate', created_at）が定義されていること
  And  `service.tenants`（id, slug, name, status, created_at）が定義されていること
  And  `service.roles`（id, name）が定義されていること
  And  `service.user_tenant_roles`（user_id, tenant_id, role_id、PK複合）が定義されていること
  And  `service.role_permissions`（role_id, resource, action、PK複合）が定義されていること
  And  `service.role_permissions` がテナントへのシード元であることが明記されていること

Scenario 3b: `tenant_{slug}` 認可テーブル設計の確定
  Given DB 設計ドキュメントが存在する
  When `tenant_{slug}` スキーマの認可テーブル定義を確認したとき
  Then `roles`（id, name, is_default）テーブルが定義されていること
  And  `user_roles`（user_id, role_id）テーブルが定義されていること
  And  `role_permissions`（role_id, resource, action）テーブルが定義されていること（独立した `permissions` テーブルは置かないことが明記されていること）
  And  プロビジョニング時に `service.role_permissions` からシードされることが明記されていること
  And  将来テナントごとに認可設定を変えられる拡張ポイントが設計コメントとして記載されていること

Scenario 4: 全テナントマイグレーション方針の確定
  Given マイグレーション方針ドキュメントが存在する
  When 方針を確認したとき
  Then `service.tenants` から全スキーマ名を取得して順次適用する手順が定義されていること
  And  マイグレーション失敗時のロールバック・スキップ方針が定義されていること
  And  新テナント追加時のスキーマ初期化・シード手順が定義されていること

Scenario 5: 既存 `owner_id` 扱い方針の確定
  Given 移行方針ドキュメントが存在する
  When `owner_id` の扱いを確認したとき
  Then テナント分離後も `owner_id` をテナント内リソース所有者識別に使い続けるか廃止するかが決定されていること
  And  決定の理由と移行ステップが記載されていること
```

---

## ルール（Example Mapping）

- **Rule 1: スキーマ名はテナントスラッグから一意に導出する**
  - Example: `slug = "acme-corp"` → スキーマ名 `tenant_acme-corp`（ただし MySQL でハイフンを含む場合はバッククォートが必要なため、スラッグからハイフンを除外するか変換する設計とする）

- **Rule 2: 認可テーブルは各テナントスキーマ内に置く**
  - Example: `tenant_acme.roles`・`tenant_acme.permissions` のようにテナントスキーマ内に存在する。グローバルな共有テーブルに認可情報を置かない

- **Rule 3: Cognito の `custom:user_type` はアクター種別の判定にのみ使う**
  - Example: `custom:user_type` でアクターが `tenant_admin` か `tenant_user` かを判定する。機能認可（どの resource × action が可能か）の判断は常に DB テーブルを参照する

- **Rule 4: マイグレーションは冪等に設計する**
  - Example: 同じマイグレーションを複数回実行しても結果が変わらない。部分失敗後の再実行で済むようにする

- **Rule 5: テナント管理台帳は `service.tenants` テーブルで管理する**
  - Example: 全テナントのスラッグ・スキーマ名・作成日時・ステータスを `service.tenants` に格納する。全テナントマイグレーション時はこのテーブルからスキーマ名一覧を取得する

---

## 不明点 / 質問

- Aurora MySQL の `max_connections` に対して、テナント数増加時の接続数影響を試算する必要があるか？ → 試算しない

## 確定済み事項（設計検討で解決済み）

| # | 内容 | 決定内容 |
|---|---|---|
| 1 | Lambda の接続方式 | **1 リクエスト 1 接続**（接続プールを使わない）。シンプルさを優先し、スキーマ切り替えの安全性を確保する。トラフィック増加時は RDS Proxy を検討する |

---

## INVEST チェック

- **Independent**: OK — Cognito 設計（SaaS-001a）と並行して進められる。接続切替設計は claim 定義が確定してから詳細化すれば十分
- **Negotiable**: OK — 認可テーブルのカラム構成・マイグレーション実行方式は交渉余地あり
- **Valuable**: OK — DB 設計が固まらないとスキーマ作成実装・マイグレーション実装が進まない
- **Estimable**: OK — 成果物が「DB 設計ドキュメント 1 件（スキーマ命名・接続切替・認可テーブル・マイグレーション方針）」と明確
- **Small**: OK — DB 設計ドキュメントの作成のみ
- **Testable**: OK — 各受け入れ条件がドキュメントの記載内容で検証可能
