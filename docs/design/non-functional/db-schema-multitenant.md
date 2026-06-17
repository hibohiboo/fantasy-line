---
last_updated: 2026-06-17
---

# マルチテナント SaaS DB スキーマ設計

## 対象読者・目的

**対象読者**: バックエンドエンジニア・インフラエンジニア・テクニカルレビュアー

**目的**: Aurora MySQL 共有クラスター上でのスキーマ per テナント構成を確定し、Drizzle ORM 接続切替・認可テーブル・テナントプロビジョニング・マイグレーション方針を実装の根拠として残す。

**対象スコープ**

含む:
- スキーマ命名規則（`tenant_{slug}` 形式・文字種変換ルール・最大長確認）
- `service` スキーマのテーブル定義
- `common` スキーマの設計方針
- `tenant_{slug}` スキーマのテーブル定義（認可テーブル含む）
- Drizzle ORM 接続切替設計
- テナントプロビジョニング時のスキーマ操作手順
- 全テナント一括マイグレーション方針
- 既存 `owner_id` カラムの扱い方針

含まない:
- スキーマ作成マイグレーションの実装コード
- Drizzle ORM 接続切替の実装コード
- テナント内認可テーブルの初期データ投入実装
- Cognito 設計（PBI-SaaS-001a で定義）

---

## スキーマ構成概要

Aurora MySQL 共有クラスター上に 3 種類のスキーマを持つ。

| スキーマ | 役割 |
|---|---|
| `service` | サービサー側ユーザー管理・全テナント台帳・デフォルトパーミッション定義 |
| `common` | 全テナントから参照可能な共通マスタデータ（具体的テーブルは業務設計 PBI で確定） |
| `tenant_{slug}` | テナント固有のビジネスデータ・テナント側ユーザー・認可テーブル |

テナントごとにスキーマを分離することで、単一クラスターのコストを維持しながらデータ混在を防ぐ。

---

## スキーマ命名規則

### 形式

```
tenant_{slug}
```

### スラッグ文字種

PBI-SaaS-001a の定義と一致させる。使用可能文字は英小文字（`a-z`）・数字（`0-9`）・ハイフン（`-`）。

### ハイフンのアンダースコア変換

MySQL のスキーマ名にハイフンを含む場合、バッククォートが必須になるため実装上の複雑さが増す。これを避けるため、スラッグのハイフン（`-`）をアンダースコア（`_`）に変換してスキーマ名を生成する。

変換例:

| テナントスラッグ | スキーマ名 |
|---|---|
| `acme` | `tenant_acme` |
| `acme-corp` | `tenant_acme_corp` |
| `my-team-01` | `tenant_my_team_01` |

この変換はリクエストハンドリング時のスキーマ解決・マイグレーション実行時など、スキーマ名を必要とするすべての箇所で統一して適用する。

### 最大長確認

- プレフィックス `tenant_`: 7 文字
- スラッグ最大長: 32 文字（PBI-SaaS-001a 定義）
- 合計最大長: 39 文字
- MySQL スキーマ名制限: 64 文字

39 文字 < 64 文字のため制約内に収まる。

---

## `service` スキーマ テーブル定義

サービサー側ユーザーの管理・全テナントの台帳・デフォルトパーミッション定義を担う。

### `service.users`

サービサー側ユーザー（`servicer_admin` / `servicer_delegate`）を管理する。

| カラム名 | 型 | 制約 |
|---|---|---|
| `id` | BIGINT UNSIGNED | AUTO_INCREMENT PRIMARY KEY |
| `cognito_sub` | VARCHAR(128) | NOT NULL UNIQUE |
| `email` | VARCHAR(255) | NOT NULL UNIQUE |
| `user_type` | ENUM('servicer_admin', 'servicer_delegate') | NOT NULL |
| `created_at` | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |

### `service.tenants`

全テナントの管理台帳。全テナントマイグレーション時はこのテーブルからスキーマ名を取得する。

| カラム名 | 型 | 制約 |
|---|---|---|
| `id` | BIGINT UNSIGNED | AUTO_INCREMENT PRIMARY KEY |
| `slug` | VARCHAR(32) | NOT NULL UNIQUE |
| `name` | VARCHAR(255) | NOT NULL |
| `status` | ENUM('active', 'suspended', 'deleted') | NOT NULL DEFAULT 'active' |
| `created_at` | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |

### `service.roles`

サービサー側のロール定義。

| カラム名 | 型 | 制約 |
|---|---|---|
| `id` | BIGINT UNSIGNED | AUTO_INCREMENT PRIMARY KEY |
| `name` | VARCHAR(64) | NOT NULL UNIQUE |

### `service.user_tenant_roles`

サービサー側ユーザーのテナントアクセス権を管理する。`servicer_*` ユーザーが特定テナントに対して持つロールを定義する。

| カラム名 | 型 | 制約 |
|---|---|---|
| `user_id` | BIGINT UNSIGNED | NOT NULL（FK → `service.users.id`） |
| `tenant_id` | BIGINT UNSIGNED | NOT NULL（FK → `service.tenants.id`） |
| `role_id` | BIGINT UNSIGNED | NOT NULL（FK → `service.roles.id`） |

PRIMARY KEY: (`user_id`, `tenant_id`, `role_id`)

### `service.role_permissions`

サービサー側ロールのデフォルトパーミッション定義。テナントプロビジョニング時に各 `tenant_{slug}.role_permissions` へのシード元として使用する。

パーミッションは `resource` × `action` の組み合わせで直接表現する。独立した `permissions` テーブルは置かない。

| カラム名 | 型 | 制約 |
|---|---|---|
| `role_id` | BIGINT UNSIGNED | NOT NULL（FK → `service.roles.id`） |
| `resource` | VARCHAR(64) | NOT NULL |
| `action` | VARCHAR(64) | NOT NULL |

PRIMARY KEY: (`role_id`, `resource`, `action`)

---

## `common` スキーマ 設計方針

全テナントから参照可能な共通マスタデータを置く。具体的なテーブルは業務設計 PBI で確定する。

テナントスキーマからは READ ONLY で参照する想定であり、テナントスキーマ側からの書き込みは行わない。

---

## `tenant_{slug}` スキーマ テーブル定義

テナント固有のビジネスデータ・テナント側ユーザー・認可テーブルを持つ。以下は認可に関わる共通テーブルの定義であり、ビジネスデータテーブルは各機能 PBI で定義する。

### `tenant_{slug}.users`

テナント側ユーザーを管理する。

| カラム名 | 型 | 制約 |
|---|---|---|
| `id` | BIGINT UNSIGNED | AUTO_INCREMENT PRIMARY KEY |
| `cognito_sub` | VARCHAR(128) | NOT NULL UNIQUE |
| `email` | VARCHAR(255) | NOT NULL |
| `user_type` | ENUM('tenant_admin', 'tenant_user') | NOT NULL |
| `created_at` | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP |

### `tenant_{slug}.roles`

テナント固有のロール定義。プロビジョニング時に `service.roles` の内容をシードし、テナントごとに独自ロールの追加が可能。

| カラム名 | 型 | 制約 |
|---|---|---|
| `id` | BIGINT UNSIGNED | AUTO_INCREMENT PRIMARY KEY |
| `name` | VARCHAR(64) | NOT NULL |
| `is_default` | TINYINT(1) | NOT NULL DEFAULT 0 |

### `tenant_{slug}.user_roles`

テナントユーザーとロールの紐付け。

| カラム名 | 型 | 制約 |
|---|---|---|
| `user_id` | BIGINT UNSIGNED | NOT NULL（FK → `tenant_{slug}.users.id`） |
| `role_id` | BIGINT UNSIGNED | NOT NULL（FK → `tenant_{slug}.roles.id`） |

PRIMARY KEY: (`user_id`, `role_id`)

### `tenant_{slug}.role_permissions`

テナント固有の認可設定。`service.role_permissions` の内容をプロビジョニング時にシードする。パーミッションは `resource` × `action` の組み合わせで直接表現し、独立した `permissions` テーブルは置かない。

将来的にテナントごとに認可設定を変更する必要が生じた場合、このテーブルにテナント独自のロールとパーミッションを追加することで対応できる拡張ポイントとして設計している。

| カラム名 | 型 | 制約 |
|---|---|---|
| `role_id` | BIGINT UNSIGNED | NOT NULL（FK → `tenant_{slug}.roles.id`） |
| `resource` | VARCHAR(64) | NOT NULL |
| `action` | VARCHAR(64) | NOT NULL |

PRIMARY KEY: (`role_id`, `resource`, `action`)

---

## Drizzle ORM 接続切替設計

### 接続方式

**1 リクエスト 1 接続**（接続プールを使わない）。

シンプルさを優先し、スキーマ切り替えの安全性を確保する。トラフィック増加時は RDS Proxy の導入を検討する。

### スキーマ名の導出

リクエスト種別に応じてスラッグを取得するソースが異なる。

| アクター種別 | スラッグ取得元 |
|---|---|
| `tenant_*` ユーザー | JWT の `custom:tenant_id` クレーム |
| `servicer_*` ユーザー | `X-Tenant-Id` リクエストヘッダー（`service.user_tenant_roles` でアクセス可否を確認後） |

取得したスラッグはハイフンをアンダースコアに変換し、`tenant_` プレフィックスを付与してスキーマ名とする。

### 切り替えタイミング

Lambda 実行コンテキスト内のリクエストハンドリング開始時、`tenantContext` ミドルウェア内でスキーマ名を解決して Drizzle の接続先に設定する。

---

## テナントプロビジョニング時のスキーマ操作

### 作成手順

以下の順序で実施する。

1. `service.tenants` にテナントレコードを登録する
2. `tenant_{slug}` スキーマ（MySQL Database）を `CREATE DATABASE` する
3. Drizzle マイグレーションを実行してテーブルを作成する
4. `service.role_permissions` の内容を `tenant_{slug}.role_permissions` にシードする
5. 初期 `tenant_admin` ユーザーを `tenant_{slug}.users` に登録する

### ロールバック手順

| 失敗箇所 | ロールバック手順 |
|---|---|
| スキーマ作成失敗（手順 2） | `service.tenants` のレコードを削除する |
| シード失敗（手順 4） | `tenant_{slug}` スキーマを `DROP DATABASE` し、`service.tenants` のレコードを削除する |

### テナント解約時

1. `tenant_{slug}` スキーマを `DROP DATABASE` する
2. `service.tenants.status` を `'deleted'` に更新する

---

## 全テナントマイグレーション方針

### 実行手順

1. `service.tenants` から `status = 'active'` の全スラッグを取得する
2. 各スラッグをスキーマ名に変換する（ハイフン→アンダースコア変換）
3. マイグレーション実行順序: `service` → `common` → 全 `tenant_*`（スラッグ昇順）

### 冪等設計

同じマイグレーションを複数回実行しても結果が変わらないように設計する。部分失敗後の再実行で復旧できる。

### 失敗時の方針

失敗テナントをログに記録し、成功済みテナントはロールバックしない（冪等マイグレーション前提）。

### 新テナント追加時

プロビジョニングフロー内でスキーマ初期化・シードを実行する。全テナントマイグレーションとは独立して動作する。

---

## 既存 `owner_id` カラムの扱い方針

### 決定: 維持する

テナント移行後も `owner_id` をテナント内リソース所有者識別に使い続ける。

### 理由

テナントスキーマ内ではユーザー間の所有権が存在するため、`owner_id` は有用なカラムとして継続する。テナントスキーマに所有権の概念がなくなるわけではないため廃止する根拠がない。

### 移行ステップ

`owner_id` の値を Cognito `sub` から `tenant_{slug}.users.id` に置き換える。具体的な実装手順は移行フェーズの実装 PBI で定義する。

---

## 変更履歴

| PBI | 変更日 | 変更内容 |
|---|---|---|
| PBI-SaaS-001b | 2026-06-17 | 初版作成。スキーマ per テナント構成・テーブル定義・Drizzle 接続切替・マイグレーション方針・owner_id 扱いを定義 |
