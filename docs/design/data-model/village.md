---
last_updated: 2026-05-05
---

# データモデル — 村管理（village）

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
```

- `User` テーブルは認証プロバイダ（PBI-014）側で管理するため、`villages.owner_id` は外部キー制約を持たない
- 同一ユーザーが同名の村を複数作成できる（ユニーク制約なし）
- 1ユーザーあたりの村数に上限なし

---

## テーブル定義

### villages テーブル

```sql
CREATE TABLE `villages` (
  `id`         SERIAL         NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(128)   NOT NULL,
  `owner_id`   VARCHAR(255)   NOT NULL,
  `created_at` TIMESTAMP      NOT NULL DEFAULT (NOW()),
  CONSTRAINT `villages_id` PRIMARY KEY (`id`)
);
```

**カラム定義:**

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | SERIAL (BIGINT UNSIGNED) | PRIMARY KEY, AUTO_INCREMENT | 村の一意識別子 |
| name | VARCHAR(128) | NOT NULL | 村名（最大128文字） |
| owner_id | VARCHAR(255) | NOT NULL | 管理者ユーザーID（JWT の sub または同等の識別子） |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | 作成日時 |

**設計方針:**

- `owner_id` は文字列型とし、認証プロバイダの識別子形式に依存しない設計にする
- `owner_id` のインデックスは現時点では作成しない。想定ユーザー数・データ量については [performance.md](../non-functional/performance.md) を参照し、スケール要件が変わった時点で追加する

ORM スキーマの実装コードはコードが正本であるため、このドキュメントには記載しない。
PBI ごとの初期実装スニペットは `docs/sprints/` 配下の実装ノートを参照すること。

マイグレーション方針はプロジェクト共通規約のため [migration.md](../non-functional/migration.md) を参照すること。

---

## CRUD 表

各ユースケース（API エンドポイント）がどのテーブルに対して何の操作を行うかを示す。

| ユースケース / エンドポイント | villages | （将来テーブル） |
|---|---|---|
| POST /villages（村を作成する） | **C** | — |
| GET /villages（村一覧を取得する） | **R** | — |

凡例: **C** = Create（INSERT）, **R** = Read（SELECT）, **U** = Update（UPDATE）, **D** = Delete（DELETE）

> 新しいエンドポイントや PBI でテーブルへの操作が増える場合、必ずこの表を更新すること。

---

## 変更履歴

| PBI | 変更日 | 変更内容 |
|---|---|---|
| PBI-001 | 2026-05-05 | villages テーブル新規追加、CRUD 表初版作成、owner_id インデックスを性能要件を踏まえ保留 |
