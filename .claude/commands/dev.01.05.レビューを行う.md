PBIドキュメントと実装差分をもとにレビューします。

# タスク

1. PBIドキュメント（受け入れ条件・スコープ）を読み込む
2. 実装計画チェックリストを読み込む
3. 以下のスキルを順番に適用してレビューを行う

## Step 1 — コードレビュー（code-review-expert）

`.claude/skills/code-review-expert/SKILL.md` を読み込み、そのワークフローに従ってコードレビューを実施する。
比較対象は `git diff develop...HEAD` とする。

## Step 2 — PBI適合レビュー（独自観点）

code-review-expert の結果に加え、以下のPBI固有の観点でレビューする：

### 機能面
- [ ] PBIの受け入れ条件（Gherkin）が全て満たされているか
- [ ] スコープ「含む」の全項目が実装されているか
- [ ] スコープ「含まない」の項目が混入していないか
- [ ] 実装計画チェックリストが全て `[x]` になっているか

## Step 3 — フロントエンドUIレビュー（web-design-guidelines）※該当時のみ

差分にフロントエンドコード（Vue コンポーネント・HTML/CSS）が含まれる場合は、`.claude/skills/web-design-guidelines/SKILL.md` を読み込み、UIガイドライン準拠チェックも行う。

# 完了条件

- code-review-expert 形式のレビュー結果がチャットに出力されていること
- 「要修正」の場合は修正後に再レビューすること
- 完了後は「レビュー完了」とチャットに書き込むこと
