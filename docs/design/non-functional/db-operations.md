---
last_updated: 2026-06-20
---

# DB 操作手順書

## 対象読者

バックエンド開発者・インフラ担当者。ローカル環境での DB 初期構築・テナント追加を行うときに参照する。

## 対象スコープ

- 含む: ローカル（Docker）での DB 初期構築手順・テナント追加手順・全テナントマイグレーション手順
- 含まない: 本番（Aurora）での手順・Cognito との連携・課金・契約管理

---

## スキーマ構成の概要

このプロジェクトでは MySQL の database（スキーマ）を機能単位で分離する。

| スキーマ名 | 用途 | マイグレーション定義 |
|---|---|---|
| `service` | サービス全体のユーザー・テナント管理 | `apps/api/drizzle-service/` |
| `tenant_{slug}` | テナントごとのデータ（ゲームデータ等） | `apps/api/drizzle-tenant/` |
| `testdb` | 旧来のビジネステーブル（PBI-SaaS-004 で削除予定） | `apps/api/drizzle/` |

マイグレーションスクリプトは `CREATE DATABASE IF NOT EXISTS` で対象スキーマを自動作成するため、
事前に手動でスキーマを作成する必要はない。

---

## 前提条件

### testuser に CREATE 権限を付与する

ローカル Docker の `testuser` には、デフォルトでは `testdb` への権限しか与えられていない。
`service` スキーマや `tenant_{slug}` スキーマを作成するには、`testuser` に CREATE DATABASE 権限が必要。

Docker コンテナの **初回起動時** に `docker/init/01-grant-create.sql` が自動実行されて権限が付与される。

```sql
-- docker/init/01-grant-create.sql（参考）
GRANT ALL PRIVILEGES ON *.* TO 'testuser'@'%';
FLUSH PRIVILEGES;
```

**注意**: `docker-entrypoint-initdb.d` のスクリプトはコンテナを初回作成したときにしか実行されない。
既存コンテナに対して権限付与するには、[コンテナ再作成手順](#コンテナを再作成する場合) を参照すること。

---

## ローカル環境の初期構築手順

### 1. Docker コンテナを起動する

```bash
cd apps/api
npm run db:up
# または
cd docker && docker compose up -d
```

コンテナ初回起動時に `docker/init/01-grant-create.sql` が実行され、`testuser` に全スキーマへの権限が付与される。

### 2. service スキーマをマイグレーションする

```bash
cd apps/api
npm run db:migrate:service:local
```

内部動作:
1. `service` スキーマを `CREATE DATABASE IF NOT EXISTS` で作成する
2. `apps/api/drizzle-service/` の SQL を順次適用する

### 3. サービス権限マスタをシードする

```bash
cd apps/api
npm run db:seed:service:local
```

`service.roles` と `service.role_permissions` に初期データを投入する。
スクリプトは `INSERT IGNORE` で冪等に動作するため、複数回実行しても問題ない。

### 4. ビジネステーブル（旧来 testdb）をマイグレーションする

```bash
cd apps/api
npm run db:migrate:local
```

PBI-SaaS-004 完了後はこの手順は不要になる予定。

---

## テナント追加手順（ローカル）

### 前提

- 上記「ローカル環境の初期構築手順」が完了していること
- `service` スキーマに対象テナントの `tenants` レコードが登録済みであること

### 手順

#### 1. `service.tenants` にテナントレコードを登録する

```sql
-- 例: slug = "acme" のテナントを追加する
INSERT INTO service.tenants (slug, name, status, created_at)
VALUES ('acme', 'ACME Corporation', 'active', NOW());
```

#### 2. テナントスキーマをマイグレーションする

```bash
cd apps/api
npm run db:migrate:all:local
```

内部動作:
1. `service.tenants` から `status = 'active'` のスラッグ一覧を取得する
2. 各スラッグに対して `tenant_{slug}` スキーマを `CREATE DATABASE IF NOT EXISTS` で作成する
3. `apps/api/drizzle-tenant/` の SQL を順次適用する

スクリプトはスラッグを `validateSlug()` で検証したうえで `slugToSchemaName()` で `tenant_acme` のような DB 名に変換する。

#### 3. 確認する

```bash
mysql -h 127.0.0.1 -u testuser -ptestpass -e "SHOW DATABASES;"
```

`tenant_acme` が表示されていれば成功。

---

## 全テナントマイグレーション手順

スキーマ変更後（新しいマイグレーションファイルを追加した後）に全テナントへ適用する。

```bash
cd apps/api
npm run db:migrate:all:local
```

- 新規テナントはスキーマを作成してからマイグレーションを適用する
- 既存テナントはスキーマが存在するため作成をスキップし、未適用マイグレーションのみ適用する
- いずれかのテナントでエラーが発生しても他のテナントの処理は続行し、最後に失敗一覧を出力して exit 1 で終了する

---

## コンテナを再作成する場合

`docker-entrypoint-initdb.d` のスクリプトはコンテナを初回作成したときにしか実行されない。
既存コンテナに対してスクリプトを再実行するにはコンテナを削除して再作成する必要がある。

```bash
cd docker
docker compose down -v    # コンテナとボリュームを削除（データも消える）
docker compose up -d      # 再作成（init スクリプトが再実行される）
```

**注意**: `-v` フラグでボリュームも削除されるため、ローカル DB のデータはすべて失われる。
実行前に必要なデータをバックアップすること。

---

## 各スクリプトのリファレンス

| npm script | 実行場所 | 内容 |
|---|---|---|
| `db:up` | `apps/api` | Docker コンテナを起動する |
| `db:migrate:service:local` | `apps/api` | `service` スキーマを作成してマイグレーションを適用する |
| `db:seed:service:local` | `apps/api` | サービス権限マスタ（roles / role_permissions）を投入する |
| `db:migrate:local` | `apps/api` | 旧 `testdb` スキーマにマイグレーションを適用する（PBI-SaaS-004 完了まで） |
| `db:migrate:all:local` | `apps/api` | アクティブな全テナントのスキーマを作成してマイグレーションを適用する |

| スクリプトファイル | 用途 |
|---|---|
| `tools/scripts/migrate-service.ts` | `service` スキーマ作成 + マイグレーション |
| `tools/scripts/migrate-all-tenants.ts` | 全テナントスキーマ作成 + マイグレーション |
| `tools/scripts/seed-service-permissions.ts` | サービス権限マスタ投入 |
| `docker/init/01-grant-create.sql` | testuser への CREATE 権限付与（初回起動時自動実行） |

---

## 変更履歴

| PBI | 変更日 | 変更内容 |
|---|---|---|
| PBI-SaaS-003 | 2026-06-20 | 初版作成。service・tenant スキーマ分離に対応した DB 操作手順を定義 |
