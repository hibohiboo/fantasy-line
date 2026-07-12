# PBI-SaaS-005b テナントプロビジョニング Lambda 品質補完

親エピック: [PBI-SaaS-001](PBI-SaaS-001.md) / 作成日: 2026-06-21

---

## ユーザーストーリー

As a バックエンド開発者  
I want PBI-SaaS-005 で判明した 2 つの未解決事項（冪等性の欠陥・テストのパス問題）を修正したい  
So that `POST /admin/setup/service-schema` が真に冪等に動作し、medium テストでマイグレーション実行が実際に検証される

---

## 背景 / 目的

[PBI-SaaS-005](PBI-SaaS-005.md) の実装完了後、以下の 2 つの問題が判明した。
どちらも本番デプロイ前に解消が必要。

引き継ぎ詳細は [sprint3/PBI-SaaS-005.md](../../sprints/sprint3/PBI-SaaS-005.md) の「未解決事項」セクションを参照。

---

## スコープ

### 含む

- **修正 1: `setupServiceSchema` の roles シードを冪等化する**
  - `db.insert(serviceRoles).values(...)` を `INSERT IGNORE INTO roles ...` の raw SQL に置き換える
  - `setupServiceSchema.small.test.ts` の「2 回実行しても同じ結果が返ること」テストが実 DB 相当の挙動でも通ることを確認する
  - medium テスト（`setupServiceSchema.medium.test.ts`）を新規作成し、Testcontainers 上で 2 回実行しても 200 OK が返ることを確認する

- **修正 2: `migrationsFolder` を環境変数で上書きできるようにする**
  - `createTenant.ts` と `migrateAllTenants.ts` の `migrationsFolder` を `process.env['MIGRATIONS_TENANT_FOLDER']` が設定されている場合はそちらを優先する
  - medium テストでは `MIGRATIONS_TENANT_FOLDER=drizzle-tenant` を設定して実際の Drizzle migrate を実行する
  - `createTenant.medium.test.ts` と `migrateAllTenants.medium.test.ts` の `migrate` のモックを外し、実 DB に対してマイグレーションが適用されることを確認する

### 含まない

- API 仕様・エンドポイントの変更
- 新規エンドポイントの追加
- CDK の変更（`MIGRATIONS_TENANT_FOLDER` は Lambda 環境変数として設定しない — Lambda バンドル内のパスを使い続ける）

---

## ユースケース

### メイン

1. `POST /admin/setup/service-schema` を 2 回呼んでも 200 OK が返る（冪等）
2. `createTenant.medium.test.ts` が実際に `tenant_{slug}` スキーマを作成・マイグレーション適用する

---

## 受け入れ条件（Gherkin）

```gherkin
Scenario A: setupServiceSchema が冪等であること（medium テスト）
  Given Testcontainers MySQL が起動している
  When  POST /admin/setup/service-schema を 2 回呼んだとき
  Then  両方とも 200 OK が返ること
  And   service.roles に servicer_admin / servicer_delegate が 1 件ずつ存在すること

Scenario B: createTenant medium テストで実 migrate が実行されること
  Given MIGRATIONS_TENANT_FOLDER=drizzle-tenant が設定されている
  When  createTenant.medium.test.ts を実行したとき
  Then  tenant_{slug} スキーマにマイグレーションが実際に適用されていること
  And   migrate のモックが不要になること

Scenario C: migrateAllTenants medium テストで実 migrate が実行されること
  Given MIGRATIONS_TENANT_FOLDER=drizzle-tenant が設定されている
  When  migrateAllTenants.medium.test.ts を実行したとき
  Then  各 tenant_{slug} スキーマにマイグレーションが実際に適用されていること
```

---

## ルール（Example Mapping）

- **Rule 1: `INSERT IGNORE` で冪等シードを実現する**
  - Example: `setupServiceSchema.ts` の roles シードを `db.execute(sql\`INSERT IGNORE INTO roles (name) VALUES ('servicer_admin'), ('servicer_delegate')\`)` に変更する

- **Rule 2: `MIGRATIONS_TENANT_FOLDER` 環境変数でパスを上書きできる**
  - Example: Lambda 実行時は `undefined`（`__dirname` 相対の `migrations-tenant/` を使う）。テスト実行時は `process.env['MIGRATIONS_TENANT_FOLDER']` が `drizzle-tenant` を指す

---

## 不明点 / 質問

なし（対処方針は PBI-SaaS-005 引き継ぎ内容で確定済み）

---

## INVEST チェック

- **Independent**: OK — PBI-SaaS-005 完了後に単独で着手できる
- **Negotiable**: OK — 冪等化の実装方法（INSERT IGNORE vs ON DUPLICATE KEY UPDATE）は交渉余地あり
- **Valuable**: OK — 冪等性の欠陥と未検証のテストは本番リスク
- **Estimable**: OK — 変更箇所が限定的で見積もりやすい
- **Small**: OK — 2 ファイルの修正 + medium テスト 2〜3 件の追加
- **Testable**: OK — Testcontainers で medium テストとして検証可能
