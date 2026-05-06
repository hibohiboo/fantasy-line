---
name: fantasy-line API設計規約
description: 日付型・タイムゾーン方針・共通アーキテクチャドキュメントの場所
type: project
---

## 日付カラムの型

「時刻を持たない純粋な日付」は PostgreSQL `DATE` 型で保存する。

**Why:** VARCHAR(10) は避ける。DATE 型のほうがDB制約・インデックスが適切に機能する。タイムゾーン変換の問題は型を分けることで回避する。

**How to apply:**
- DB: `DATE` 型カラム
- Drizzle ORM: `date('col', { mode: 'string' })` — DB から "YYYY-MM-DD" 文字列として直接取得し、Date オブジェクト変換を経由しない
- Zod スキーマ（入力）: `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` — "YYYY-MM-DD" 文字列として受け取る
- API リクエスト / レスポンス: "YYYY-MM-DD" 文字列で統一
- OpenAPI: `type: string, format: date`

## タイムゾーン方針

- バックエンド / API / DB: すべて UTC で統一
  - `TIMESTAMP` 型 (`created_at` など) は UTC で保存・返却
  - `DATE` 型はタイムゾーンを持たない暦日として扱う
- フロントエンド: 表示時にローカルタイムゾーンへ変換する責務を持つ

詳細は `docs/design/non-functional/api-architecture.md` の「タイムゾーン方針」セクションを参照。

## 共通アーキテクチャドキュメントの場所

`docs/design/non-functional/api-architecture.md` に以下を集約：
- 認証・ユーザーID取得パターン（開発中: X-User-Id ヘッダー / 本番: API Gateway Authorizer）
- 代表パターン1: 認証 + バリデーション + 書き込み
- 代表パターン2: 認証 + リソース所有権チェック + 書き込み
- 代表パターン3: 認証 + 読み取り（所有リソースのみ）
- バリデーションエラーレスポンス形式
- タイムゾーン方針

新しいエンドポイントを設計するとき、上記パターンのどれに当たるかを確認してから詳細設計を書く。
