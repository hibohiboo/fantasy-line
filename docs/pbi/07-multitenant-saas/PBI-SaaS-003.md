# PBI-SaaS-003 DB スキーマ per テナント マイグレーション実装

親エピック: [PBI-SaaS-001](PBI-SaaS-001.md) / 作成日: 2026-06-17

---

## ユーザーストーリー

As a バックエンド開発者  
I want `service` スキーマのテーブル定義・Drizzle マイグレーション・全テナントマイグレーションスクリプトを実装したい  
So that SaaS 化後の DB 基盤が整い、後続のプロビジョニング実装・API 実装が行える

---

## 背景 / 目的

[db-schema-multitenant.md](../../design/non-functional/db-schema-multitenant.md) で確定した設計を実装する。
Aurora MySQL 上に `service` スキーマを作成し、サービサー側の管理テーブル・認可テーブルを整備する。
`tenant_{slug}` スキーマのテンプレートとなる Drizzle スキーマ定義を作成し、
テナントプロビジョニング時と全テナント横断マイグレーション時に使えるスクリプトを用意する。

---

## スコープ

### 含む

- スラッグ → スキーマ名変換ユーティリティ関数（`apps/api/src/shared/tenant.ts`）
  - 変換ルール: ハイフン → アンダースコア、`tenant_` プレフィックス付与
  - バリデーション: 使用可能文字（英小文字・数字・ハイフン）・長さ制約（2〜32 文字）チェック
- `service` スキーマの Drizzle スキーマ定義（TypeScript）
  - `users`・`tenants`・`roles`・`user_tenant_roles`・`role_permissions`
- `tenant_{slug}` スキーマ用 Drizzle スキーマ定義テンプレート（TypeScript）
  - `users`・`roles`・`user_roles`・`role_permissions`
- `service` スキーマの Drizzle マイグレーション SQL 生成
- `service.role_permissions` デフォルトデータのシードスクリプト（`tools/scripts/seed-service-permissions.ts`）
- 全テナントマイグレーションスクリプト（`tools/scripts/migrate-all-tenants.ts`）
  - `service.tenants` からスキーマ名一覧を取得し、順次 Drizzle migrate を実行
  - 失敗テナントをログに記録してスキップ（冪等設計）
- ユニットテスト（スラッグ変換・スキーマ定義の整合性確認）
- ローカル Docker MySQL でのマイグレーション動作確認

### 含まない

- `tenant_{slug}` スキーマの実際の CREATE（→ PBI-SaaS-005 プロビジョニング Lambda で実行）
- `common` スキーマの具体的テーブル定義（業務設計 PBI で確定）
- Cognito 実装（→ PBI-SaaS-002）

---

## ユースケース

### メイン

1. `service` スキーマに対して Drizzle マイグレーションを実行し、全テーブルが作成される
2. `service.role_permissions` にデフォルトパーミッションを初期データとして投入する
3. 全テナントマイグレーションスクリプトを実行すると、`service.tenants` から全スキーマ名を取得して順次マイグレーションが適用される

### 例外

- スラッグにハイフン以外の無効文字が含まれる → バリデーションエラーを返す
- 全テナントマイグレーション中に一部テナントで失敗 → 失敗テナントをログに記録してスキップ（成功済みはロールバックしない）

---

## 受け入れ条件（Gherkin）

```gherkin
Scenario 1: スラッグ変換ユーティリティが正しく動作すること
  Given スラッグ変換ユーティリティが実装されている
  When スラッグ "acme-corp" を変換したとき
  Then スキーマ名 "tenant_acme_corp" が返ること
  When スラッグ "beta" を変換したとき
  Then スキーマ名 "tenant_beta" が返ること
  When 無効なスラッグ "UPPER" を入力したとき
  Then バリデーションエラーが返ること
  When 無効なスラッグ "a" （1 文字）を入力したとき
  Then バリデーションエラーが返ること

Scenario 2: `service` スキーマのマイグレーションが適用されること
  Given Aurora MySQL（ローカル Docker）が起動している
  When `service` スキーマに対して Drizzle マイグレーションを実行したとき
  Then `service.users`・`service.tenants`・`service.roles`・`service.user_tenant_roles`・`service.role_permissions` テーブルが作成されること
  And  各テーブルのカラム定義が設計ドキュメントと一致すること

Scenario 3: `tenant_{slug}` スキーマテンプレートのマイグレーションが適用されること
  Given Aurora MySQL（ローカル Docker）が起動している
  When テスト用テナントスキーマ（例: `tenant_test`）に対して Drizzle マイグレーションを実行したとき
  Then `users`・`roles`・`user_roles`・`role_permissions` テーブルが作成されること

Scenario 4: 全テナントマイグレーションスクリプトが冪等に動作すること
  Given `service.tenants` に 2 件以上のテナントが登録されている
  When マイグレーションスクリプトを 2 回実行したとき
  Then 2 回目も正常終了すること（エラーが発生しないこと）

Scenario 5: マイグレーション失敗時にスキップして続行すること
  Given `service.tenants` に正常テナントと存在しないスキーマのテナントが混在している
  When 全テナントマイグレーションスクリプトを実行したとき
  Then 失敗テナントのスキーマ名がログに記録されること
  And  正常テナントのマイグレーションは完了すること
```

---

## ルール（Example Mapping）

- **Rule 1: スラッグのハイフンはスキーマ名でアンダースコアに変換する**
  - Example: `acme-corp` → `tenant_acme_corp`。変換は `slugToSchemaName(slug)` に集約し、直接文字列結合をしない

- **Rule 2: マイグレーションは冪等に設計する**
  - Example: Drizzle の `migrate()` は `__drizzle_migrations` テーブルで適用済みを管理するため、同じマイグレーションの二重適用は自動的にスキップされる

- **Rule 3: `service.role_permissions` の初期データはシードスクリプトで管理する**
  - Example: `tools/scripts/seed-service-permissions.ts` にデフォルトパーミッション定義を記述し、環境構築時・テスト時に実行できるようにする

---

## 不明点 / 質問

なし（設計ドキュメントで確定済み）

---

## INVEST チェック

- **Independent**: OK — PBI-SaaS-002（Cognito CDK）と並行して進められる
- **Negotiable**: OK — シードスクリプトの実装方式・全テナントマイグレーションのエラー処理方針は交渉余地あり
- **Valuable**: OK — DB 基盤なしではプロビジョニング・API 実装が進まない
- **Estimable**: OK — Drizzle スキーマ定義とマイグレーションは実績あり
- **Small**: OK — スキーマ定義とマイグレーションスクリプトの実装のみ
- **Testable**: OK — ローカル Docker MySQL でマイグレーション実行テスト + スラッグ変換ユニットテスト
