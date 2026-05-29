---
description: 入力検証 / 認可 / Secrets / IAM / Markdown XSS / ZAP 観点で、変更箇所のセキュリティを重点的にレビューしてもらう
---

# セキュリティレビュー依頼

利用 Skill:

- `.claude/skills/security-review/SKILL.md`
- `.claude/skills/aws-cdk-patterns/SKILL.md`（CDK 変更時）

---

## 依頼内容

以下のテンプレートを埋めてから、セキュリティレビューを進めてください。

```txt
## レビュー対象
- ブランチ / コミット範囲:
- 変更概要:

## 影響を受けるリソース・データ
- API エンドポイント:
- AWS リソース:
- 取り扱うデータ（PII / Secrets / ログ）:

## 既知の制約・前提
- 認証要否:
- ZAP 検査対象:
```

## 守ること

- `.claude/skills/security-review/SKILL.md` の手順とチェックリストに従う
- OWASP Top 10 観点で抜け漏れを点検する
- 入力検証（境界での `unknown` → `zod` narrow）を確認する
- 認可チェックの抜けを確認する
- Secrets / `.env*` がコミットされていないか確認する
- ログ / エラー応答に PII / 内部情報が出ていないか確認する
- IAM ワイルドカード（`*`）の有無を確認する
- Markdown / HTML の XSS リスクを確認する
- CDK 変更がある場合は `.claude/skills/aws-cdk-patterns/SKILL.md` も併用し、
  cdk-nag 警告 / 抑制理由を確認する
- ZAP 検査対象として安定するかを確認する
- 修正優先度を CRITICAL / HIGH / MEDIUM / LOW で付ける

## 出力フォーマット

```txt
## サマリ
- CRITICAL:
- HIGH:
- MEDIUM:
- LOW:

## 指摘（重要度順）
重要度:
問題点:
根拠 / 該当ファイル:
改善案:
代替案:

## 確認した観点
- 入力検証
- 認可
- Secrets
- IAM
- ログ / エラー応答
- Markdown / HTML
- CDK / cdk-nag
- 依存ライブラリ
- ZAP 検査

## 追加で確認したい質問
```

## 禁止事項

- 修正優先度を付けない
- 根拠（OWASP のどの項目か / 該当ファイル）を書かない
- 「とりあえず safe」と曖昧に評価する
- ZAP / CodeQL の警告を理由なし suppress させる
- IAM ワイルドカード追加を承認する
- Secrets が一時的でもリポジトリに残ることを許容する
