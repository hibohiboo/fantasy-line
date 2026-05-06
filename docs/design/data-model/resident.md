---
last_updated: 2026-05-06
---

# データモデル — 住人管理（resident）

## 対象読者

実装担当の開発者、およびデータベース設計の影響範囲を確認したいレビュアー。

---

## ER 図

```
User（認証ユーザー）
  └─ 1:N ─ Village（村）
              id         : 連番ID（主キー）
              name       : 村名（最大128文字、必須）
              owner_id   : 管理者ユーザーID
              created_at : 作成日時
              │
              └─ 1:N ─ Resident（住人）
                          id         : 連番ID（主キー）
                          name       : 住人名（最大128文字、必須）
                          name_kana  : 読み（全角カタカナ、最大128文字、必須）
                          birth_date : 生年月日（DATE 型、必須）
                          village_id : 所属村ID（villages.id への参照）
                          created_at : 作成日時（UTC）
```

- `Resident` は必ず 1 つの `Village` に所属する（`village_id` は NOT NULL）
- 同一村に同名の住人を複数登録できる（ユニーク制約なし）
- 1 村あたりの住人数に上限なし

---

## テーブル定義

### residents テーブル

```sql
CREATE TABLE "residents" (
  "id"         BIGSERIAL      NOT NULL,
  "name"       VARCHAR(128)   NOT NULL,
  "name_kana"  VARCHAR(128)   NOT NULL,
  "birth_date" DATE           NOT NULL,
  "village_id" BIGINT         NOT NULL,
  "created_at" TIMESTAMP      NOT NULL DEFAULT NOW(),
  CONSTRAINT "residents_pkey" PRIMARY KEY ("id")
);
```

**カラム定義:**

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | BIGSERIAL | PRIMARY KEY | 住人の一意識別子 |
| name | VARCHAR(128) | NOT NULL | 住人名（最大128文字） |
| name_kana | VARCHAR(128) | NOT NULL | 読み（全角カタカナのみ、最大128文字） |
| birth_date | DATE | NOT NULL | 生年月日（タイムゾーンなし純粋日付） |
| village_id | BIGINT | NOT NULL | 所属村ID（villages.id を参照） |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | 作成日時（UTC） |

**設計方針:**

- `birth_date` は PostgreSQL `DATE` 型で保存する。`DATE` はタイムゾーンを持たない純粋な暦日であり、タイムゾーン変換の影響を受けない。Drizzle ORM では `mode: 'string'` を使用して DB から "YYYY-MM-DD" 文字列として直接取得する
- `village_id` は外部キー制約を設けない。villages テーブルとの整合性はアプリケーション層（権限チェック）で担保する
- `name_kana` のカタカナ形式はアプリケーション層（Zod バリデーション）で担保する。DB 側にチェック制約は設けない
- `name_kana` にインデックスを設けることで一覧取得時の `ORDER BY name_kana` を効率化する

ORM スキーマの実装コードはコードが正本であるため、このドキュメントには記載しない。
PBI ごとの初期実装スニペットは `docs/sprints/` 配下の実装ノートを参照すること。

マイグレーション方針はプロジェクト共通規約のため [migration.md](../non-functional/migration.md) を参照すること。

---

## CRUD 表

各ユースケース（API エンドポイント）がどのテーブルに対して何の操作を行うかを示す。

| ユースケース / エンドポイント | villages | residents |
|---|---|---|
| POST /api/villages（村を作成する） | **C** | — |
| GET /api/villages（村一覧を取得する） | **R** | — |
| POST /api/residents（住人を登録する） | **R**（権限確認） | **C** |
| GET /api/residents（全住人一覧を取得する） | **R**（JOIN） | **R** |
| GET /api/villages/:id/residents（村別住人一覧） | **R**（権限確認） | **R** |

凡例: **C** = Create（INSERT）, **R** = Read（SELECT）, **U** = Update（UPDATE）, **D** = Delete（DELETE）

> 新しいエンドポイントや PBI でテーブルへの操作が増える場合、必ずこの表を更新すること。

---

## 変更履歴

| PBI | 変更日 | 変更内容 |
|---|---|---|
| PBI-003 | 2026-05-06 | residents テーブル新規追加、CRUD 表更新、birth_date を DATE 型とした設計方針を記載 |
