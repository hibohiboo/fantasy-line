# PBI-SaaS-005 テナントプロビジョニング Lambda 実装

親エピック: [PBI-SaaS-001](PBI-SaaS-001.md) / 作成日: 2026-06-17

---

## ユーザーストーリー

As a `servicer_admin`  
I want テナント発行操作を管理 Lambda API 経由で実行したい  
So that 新テナントの DB スキーマ作成・Cognito ユーザー作成・初期データシードが自動化され、安全かつ再現性のある手順でテナントを発行できる

---

## 背景 / 目的

[tenant-provisioning.md](../../design/non-functional/tenant-provisioning.md) で確定した設計を実装する。
`servicer_admin` が管理 Lambda API を呼び出すと、テナント登録・スキーマ作成・シード・Cognito ユーザー作成・招待メール送信が
一連のフローで実行される。障害発生時のロールバック処理も実装し、中途半端な状態が残らないようにする。
また `servicer_delegate` 作成 API も同 Lambda にまとめて実装する。

---

## スコープ

### 含む

- **本番（Aurora）への `service` スキーマ初期構築**
  - CDK デプロイ後に一度だけ実行するセットアップ Lambda（`POST /admin/setup/service-schema`）を実装する
  - 処理内容: Aurora に `service` スキーマを `CREATE DATABASE IF NOT EXISTS` → Drizzle マイグレーション（`drizzle-service/`）適用 → 権限マスタシード（`servicer_admin` / `servicer_delegate` ロールと `role_permissions`）
  - Aurora に接続する IAM ロールおよび Secrets Manager の接続情報設定を CDK で定義する
  - `docs/design/non-functional/db-operations.md` に本番手順（Aurora 接続情報・権限設定・初回セットアップ手順・全テナントマイグレーション手順）を追記する
- テナントプロビジョニング Lambda API（`servicer_admin` 専用）
  - `POST /admin/tenants`（テナント発行）
  - 処理順序:
    1. スラッグ・メールアドレスのバリデーション（Zod）
    2. `service.tenants` 登録
    3. Aurora に `tenant_{slug}` スキーマを `CREATE DATABASE`
    4. Drizzle マイグレーション実行（`drizzle-tenant/` を適用）
    5. `service.role_permissions` → `tenant_{slug}.role_permissions` シード
    6. Cognito `AdminCreateUser`（`custom:user_type: "tenant_admin"` / `custom:tenant_id: "{slug}"`）
    7. 招待メール（日本語カスタマイズ）送信
    8. `tenant_{slug}.users` に初期管理者レコード登録
  - 各ステップの障害発生時ロールバック処理（逆順）
- **全テナントマイグレーション Lambda**（スキーマ変更デプロイ時に実行）
  - `POST /admin/migrate/all-tenants`（`servicer_admin` 専用）
  - `service.tenants` からアクティブスラッグを取得し、各 `tenant_{slug}` スキーマに未適用マイグレーションを順次適用する
  - 失敗テナントをスキップして続行し、最終結果（成功数・失敗一覧）を CloudWatch Logs に出力する
- `servicer_delegate` 作成 Lambda API（`servicer_admin` 専用）
  - `POST /admin/users`（`servicer_delegate` 作成）
  - Cognito `AdminCreateUser`（`custom:user_type: "servicer_delegate"`、`custom:tenant_id` は設定しない）
  - `service.users` 登録 + `service.user_tenant_roles` 設定
- CDK での管理 Lambda・API Gateway エンドポイント追加（`servicer_admin` のみアクセス可）
- ユニットテスト・統合テスト

### 含まない

- テナント内ユーザー管理 API（→ PBI-SaaS-006）
- フロントエンド画面（→ PBI-SaaS-007）
- テナント解約・削除フロー
- `common` スキーマの具体的テーブル定義

---

## ユースケース

### メイン（テナント発行）

1. `servicer_admin` が `POST /admin/tenants` にスラッグと初期管理者メールアドレスを送る
2. バリデーション通過後、`service.tenants` に登録
3. Aurora に `tenant_{slug}` スキーマを作成しマイグレーションを実行
4. `service.role_permissions` から `tenant_{slug}.role_permissions` にシード
5. Cognito `AdminCreateUser` で初期 `tenant_admin` を作成し招待メールを送信
6. `tenant_{slug}.users` に初期管理者レコードを登録
7. 201 Created とテナント情報を返す

### 代替

- 同スラッグのテナントがすでに存在する場合 → 409 Conflict

### 例外

- スキーマ作成失敗 → `service.tenants` レコードを削除し 500 を返す
- シード失敗 → スキーマを `DROP` し `service.tenants` レコードを削除して 500 を返す
- Cognito ユーザー作成失敗 → スキーマ `DROP` + `service.tenants` レコード削除して 500 を返す

---

## 受け入れ条件（Gherkin）

```gherkin
Scenario 0: service スキーマ初期構築が冪等に完了すること
  Given `servicer_admin` の JWT でリクエストしている
  And   Aurora に `service` スキーマが存在しない（または既に存在する）
  When  POST /admin/setup/service-schema にリクエストを送ったとき
  Then  200 OK が返ること
  And   Aurora に `service` スキーマが存在すること
  And   `service.roles` に `servicer_admin` / `servicer_delegate` が登録されていること
  And   `service.role_permissions` に初期権限データが存在すること
  And   2 回実行しても同じ結果が返ること（冪等）

Scenario 0b: 全テナントマイグレーションが未適用のみ適用すること
  Given `servicer_admin` の JWT でリクエストしている
  And   アクティブなテナントが 3 件存在する
  And   うち 1 件に未適用のマイグレーションファイルがある
  When  POST /admin/migrate/all-tenants にリクエストを送ったとき
  Then  200 OK が返ること
  And   未適用だったテナントにマイグレーションが適用されていること
  And   既に適用済みのテナントはスキップされること
  And   処理結果（成功数・失敗一覧）が CloudWatch Logs に出力されること

Scenario 1: テナント発行が正常に完了すること
  Given `servicer_admin` の JWT でリクエストしている
  And   スラッグ "new-tenant" がまだ存在しない
  When  POST /admin/tenants に { slug: "new-tenant", adminEmail: "admin@example.com" } を送ったとき
  Then  201 Created が返ること
  And   `service.tenants` に slug = "new-tenant" のレコードが存在すること
  And   Aurora に `tenant_new_tenant` スキーマが存在すること
  And   `tenant_new_tenant.role_permissions` に `service.role_permissions` の内容がシードされていること
  And   Cognito に adminEmail の `tenant_admin` ユーザーが作成されていること
  And   `tenant_new_tenant.users` に初期管理者レコードが存在すること

Scenario 2: 重複スラッグは 409 を返すこと
  Given `servicer_admin` の JWT でリクエストしている
  And   スラッグ "existing" がすでに `service.tenants` に存在する
  When  POST /admin/tenants に { slug: "existing", adminEmail: "admin2@example.com" } を送ったとき
  Then  409 Conflict が返ること
  And   データに変更が加えられていないこと

Scenario 3: スキーマ作成失敗時に `service.tenants` がロールバックされること
  Given `servicer_admin` の JWT でリクエストしている
  And   Aurora スキーマ作成が失敗するよう設定されている（スタブ）
  When  POST /admin/tenants に有効なリクエストを送ったとき
  Then  500 Internal Server Error が返ること
  And   `service.tenants` に対象スラッグのレコードが残っていないこと

Scenario 4: `servicer_admin` 以外は 403 を返すこと
  Given `tenant_admin` の JWT でリクエストしている
  When  POST /admin/tenants にリクエストを送ったとき
  Then  403 Forbidden が返ること

Scenario 5: `servicer_delegate` 作成が正常に完了すること
  Given `servicer_admin` の JWT でリクエストしている
  When  POST /admin/users に { email: "delegate@example.com", tenantIds: [1, 2] } を送ったとき
  Then  201 Created が返ること
  And   Cognito に `custom:user_type: "servicer_delegate"` のユーザーが作成されていること
  And   `custom:tenant_id` が設定されていないこと
  And   `service.user_tenant_roles` に対象テナントへのアクセス設定が存在すること
```

---

## ルール（Example Mapping）

- **Rule 0: `service` スキーマセットアップは冪等に実装する**
  - Example: `CREATE DATABASE IF NOT EXISTS` と `INSERT IGNORE` を使い、2 回実行しても同じ結果になるよう実装する。本番での再実行リスクを排除する

- **Rule 0b: 全テナントマイグレーションは 1 テナントの失敗で停止しない**
  - Example: 失敗テナントをスキップして次のテナントに進み、全件処理後に結果を集計して返す。一部失敗は HTTP 207 Multi-Status で返す

- **Rule 1: プロビジョニングは `servicer_admin` のみが実行できる**
  - Example: `tenantContext` + `requirePermission('tenant', 'create')` ミドルウェアで保護する。`tenant_admin` からは呼び出せない

- **Rule 2: ロールバックは逆順で実行する**
  - Example: ステップ 6（`tenant_{slug}.users` 登録）で失敗した場合は、Cognito ユーザー削除 → スキーマ DROP → `service.tenants` 削除 の順で巻き戻す

- **Rule 3: 招待メールは Cognito の `AdminCreateUser` でカスタムテンプレートを使って送信する**
  - Example: Cognito の `inviteMessageTemplate` を日本語に設定する。初回ログイン時にパスワード変更を要求する（`TemporaryPassword` は自動生成）

- **Rule 4: `servicer_delegate` の JWT には `custom:tenant_id` を設定しない**
  - Example: Cognito `AdminCreateUser` 時に `custom:tenant_id` を `UserAttributes` に含めない。テナントアクセスは `service.user_tenant_roles` で管理する

---

## 不明点 / 質問

なし（設計ドキュメントで確定済み）

---

## INVEST チェック

- **Independent**: NG — PBI-SaaS-002（Cognito CDK）と PBI-SaaS-003（DB マイグレーション）の完了後に着手。PBI-SaaS-004 と並行可能
- **Negotiable**: OK — ロールバック戦略・招待メールのテンプレート内容は交渉余地あり
- **Valuable**: OK — プロビジョニングなしではテナントを追加できない
- **Estimable**: OK — フロー設計ドキュメントで手順が詳細化済み
- **Small**: 要注意 — 管理 Lambda に加えて `service` スキーマ初期構築・全テナントマイグレーション Lambda・本番 DB 操作手順書の整備を含む。スコープが広いと判断した場合は `service` スキーマ初期構築 + 手順書整備を `PBI-SaaS-005b` として独立させることを検討する
- **Testable**: OK — ユニットテスト（各ステップのスタブ）+ 統合テスト（ローカル Docker MySQL + Cognito Local）
