---
description: API Gateway + Lambda の小さな読み取り API を、入出力 / ステータスコード / エラー形式 / ZAP 検査 / 低コストの観点で設計してもらう
---

# API 設計依頼

利用 Skill:

- `.claude/skills/api-design/SKILL.md`
- `.claude/skills/security-review/SKILL.md`（必要に応じて）

---

## 依頼内容

以下のテンプレートを埋めてから、設計を進めてください。

```txt
## 設計対象
- 機能名:
- ユースケース（誰が・いつ・なぜ叩くか）:
- 想定呼び出し頻度:

## 既知の制約
- 既存エンドポイントとの整合:
- 認証要否:
- ZAP 検査対象に含めるか:

## 期待する成果物
- エンドポイント一覧（メソッド + パス）
- 入力 schema（zod 想定）
- レスポンス schema（成功時 / エラー時）
- ステータスコード一覧と意味
- エラーコード一覧（`code`, 用途, ステータスコード）
- 低コスト性の評価メモ
```

## 守ること

- `.claude/skills/api-design/SKILL.md` の手順とチェックリストに従う
- URL は名詞・複数形・kebab-case
- メソッドは HTTP セマンティクスに従う（200 で全部返さない）
- 入力検証は境界で行う（`unknown` で受けて `zod` で narrow）
- レスポンスは既存の統一フォーマット（`data` / `error` ラッパ）に合わせる
- ZAP 検査しやすい安定したエラー応答にする
- 認証が必要な箇所では認証方式を明記し、ADR が必要なら指摘する
- 低コスト構成（呼び出し回数・キャッシュ・レイテンシ）を意識する
- 既存の `.claude/instructions/api.md` / `.claude/instructions/security.md` / `.claude/instructions/infra.md` と矛盾しない

## 出力フォーマット

```txt
## エンドポイント
- METHOD /path
  - 用途:
  - 認可:

## 入力 schema

## レスポンス schema（成功）

## レスポンス schema（エラー）

## ステータスコード / エラーコード

## ZAP 検査観点

## コスト評価

## 未解決事項 / 質問
```

## 禁止事項

- スタックトレースや内部 ID をエラー応答に含める設計
- 200 で `success: false` を返す設計
- 認証なしで状態変更系エンドポイントを公開する
- 仕様化されていない隠しパラメータを残す
- `.claude/instructions/*` と矛盾する提案をそのまま採用する
