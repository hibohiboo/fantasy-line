---
last_updated: 2026-05-05
---

# マイグレーション方針（DB スキーマ管理）

## 対象読者

API・インフラ担当の開発者。DB スキーマを変更するすべての PBI で参照すること。

---

## ツールと管理方式

- **Drizzle Kit** を使用してマイグレーション SQL を自動生成する
- 生成された SQL ファイルは `apps/api/drizzle/` 配下に連番で管理する
- マイグレーションファイルは生成後にコミットし、レビュー対象とする

---

## ファイル命名規則

Drizzle Kit が自動生成する連番形式に従う。

```
apps/api/drizzle/
  0000_smiling_metal_master.sql   # items テーブル（初回）
  0001_<generated_name>.sql       # 次の変更
  0002_<generated_name>.sql       # …
```

- ファイル名の `<generated_name>` 部分は Drizzle Kit が生成するランダムな英単語列であり、手動で変更しない
- 連番は Drizzle Kit が自動で採番する

---

## マイグレーション実行方法

### ローカル開発

```bash
# スキーマ変更後にマイグレーションファイルを生成
npx drizzle-kit generate

# ローカル MySQL（Docker）に対して適用
npx drizzle-kit migrate
```

### 本番環境（AWS）

- デプロイ時に `migration.ts` Lambda ハンドラーが自動実行される
- ハンドラーは `apps/api/drizzle/` 配下の未適用ファイルを順次実行する

---

## 禁止事項

- 既にコミット済みのマイグレーションファイルを編集・削除しない
  - 適用済みマイグレーションの変更は本番DBとの整合性を壊す
- 手書きの SQL をマイグレーションファイルとして追加しない
  - 必ず Drizzle Kit の生成物を使用する（スキーマ定義と SQL の乖離を防ぐため）

---

## スキーマ変更手順

1. `apps/api/src/db/schema.ts` の Drizzle スキーマ定義を変更する
2. `npx drizzle-kit generate` でマイグレーションファイルを生成する
3. 生成された SQL の内容をレビューし、意図通りの変更であることを確認する
4. ローカル環境で `npx drizzle-kit migrate` を実行して動作確認する
5. スキーマ変更とマイグレーションファイルをセットでコミットする

---

## 変更履歴

| PBI | 変更日 | 変更内容 |
|---|---|---|
| PBI-001 | 2026-05-05 | マイグレーション方針の初版作成 |
