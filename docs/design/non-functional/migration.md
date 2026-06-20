---
last_updated: 2026-06-20
---

# マイグレーション方針（DB スキーマ管理）

## 対象読者

API・インフラ担当の開発者。DB スキーマを変更するすべての PBI で参照すること。

---

## スキーマ構成とマイグレーション定義ファイルの対応

PBI-SaaS-003 以降、MySQL スキーマ（= データベース）を機能単位で分離している。

| MySQL スキーマ | Drizzle スキーマ定義 | マイグレーションファイル置き場 | Drizzle Kit 設定 |
|---|---|---|---|
| `service` | `apps/api/src/db/service-schema.ts` | `apps/api/drizzle-service/` | `drizzle.service.config.ts` |
| `tenant_{slug}` | `apps/api/src/db/tenant-template-schema.ts` | `apps/api/drizzle-tenant/` | `drizzle.tenant-template.config.ts` |
| `testdb` | `apps/api/src/db/schema.ts`（旧） | `apps/api/drizzle/` | `drizzle.config.ts` |

> `testdb` は PBI-SaaS-004 でビジネステーブルが `tenant_{slug}` スキーマへ移行するまでの暫定管理。

---

## ツールと管理方式

- **Drizzle Kit** を使用してマイグレーション SQL を自動生成する（`generate` コマンド）
- 生成された SQL ファイルは各 `drizzle-*` ディレクトリに連番で管理する
- マイグレーションファイルは生成後にコミットし、レビュー対象とする
- **実行はラッパースクリプトを使う**: `drizzle-kit push` は `CREATE DATABASE` を行えないため、
  `tools/scripts/migrate-service.ts` / `migrate-all-tenants.ts` 経由でマイグレーションする

---

## ファイル命名規則

Drizzle Kit が自動生成する連番形式に従う。

```
apps/api/drizzle-service/
  0000_wet_multiple_man.sql       # service スキーマ初回
  0001_<generated_name>.sql       # 次の変更
apps/api/drizzle-tenant/
  0000_slimy_the_stranger.sql     # tenant テンプレート初回
apps/api/drizzle/
  0000_smiling_metal_master.sql   # testdb 初回（旧来）
```

- ファイル名の `<generated_name>` 部分は Drizzle Kit が生成するランダムな英単語列であり、手動で変更しない
- 連番は Drizzle Kit が自動で採番する

---

## マイグレーション実行方法

### ローカル開発

操作手順の詳細は [db-operations.md](./db-operations.md) を参照すること。

```bash
# スキーマ変更後にマイグレーション SQL を生成する
cd apps/api
npm run db:generate:service    # service スキーマ用
npm run db:generate:tenant     # tenant テンプレート用
npm run db:generate            # 旧 testdb 用（PBI-SaaS-004 完了まで）

# ローカル MySQL（Docker）に適用する
npm run db:migrate:service:local   # service スキーマ
npm run db:migrate:all:local       # アクティブな全テナントスキーマ
npm run db:migrate:local           # 旧 testdb（PBI-SaaS-004 完了まで）
```

### 本番環境（AWS）

- デプロイ時に migration Lambda ハンドラーが自動実行される（未実装・PBI-SaaS-004 以降で実装予定）
- ハンドラーは各 `drizzle-*` ディレクトリ配下の未適用ファイルを順次実行する予定

---

## 禁止事項

- 既にコミット済みのマイグレーションファイルを編集・削除しない
  - 適用済みマイグレーションの変更は本番DBとの整合性を壊す
- 手書きの SQL をマイグレーションファイルとして追加しない
  - 必ず Drizzle Kit の生成物を使用する（スキーマ定義と SQL の乖離を防ぐため）
- `drizzle-kit push` でテナントスキーマを直接操作しない
  - `service` と `tenant` テンプレートは同名テーブルを持つため、`testdb` に push すると衝突する

---

## スキーマ変更手順

### service スキーマを変更する場合

1. `apps/api/src/db/service-schema.ts` の Drizzle スキーマ定義を変更する
2. `npm run db:generate:service` でマイグレーション SQL を生成する
3. 生成された SQL の内容をレビューし、意図通りの変更であることを確認する
4. `npm run db:migrate:service:local` でローカル環境に適用して動作確認する
5. スキーマ定義とマイグレーションファイルをセットでコミットする

### tenant テンプレートを変更する場合

1. `apps/api/src/db/tenant-template-schema.ts` の Drizzle スキーマ定義を変更する
2. `npm run db:generate:tenant` でマイグレーション SQL を生成する
3. 生成された SQL の内容をレビューする
4. `npm run db:migrate:all:local` で全テナントに適用して動作確認する
5. スキーマ定義とマイグレーションファイルをセットでコミットする

---

## 変更履歴

| PBI | 変更日 | 変更内容 |
|---|---|---|
| PBI-001 | 2026-05-05 | マイグレーション方針の初版作成 |
| PBI-SaaS-003 | 2026-06-20 | マルチスキーマ分離に対応。service・tenant テンプレート・testdb の 3 系統を整理。ラッパースクリプト方式に変更 |
