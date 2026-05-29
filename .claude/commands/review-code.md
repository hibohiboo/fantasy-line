---
description: PR / 差分を重要度付きでレビューし、根拠と改善案・代替案を示してもらう
---

# コードレビュー依頼

利用 Skill:

- `.claude/skills/code-review/SKILL.md`
- `.claude/skills/coding-standards/SKILL.md`
- `.claude/skills/security-review/SKILL.md`（セキュリティ影響がある変更時）
- `.claude/skills/aws-cost-review/SKILL.md`（AWS 構成変更時）

---

## 依頼内容

以下のテンプレートを埋めてから、レビューを進めてください。

```txt
## レビュー対象
- ブランチ / コミット範囲:
- 変更目的（PR 説明 / Issue 番号）:

## 重点的に見てほしい観点
- セキュリティ / コスト / 保守性 / 設計 / テスト など

## 既知の制約・前提
- 関連する .claude/instructions/*.md
- 関連する .claude/skills/*/SKILL.md
```

## 守ること

- `.claude/skills/code-review/SKILL.md` のレビュー手順に従う
- 各指摘は次の形式で出す

```txt
重要度: CRITICAL / HIGH / MEDIUM / LOW
問題点:
根拠:
改善案:
代替案:
```

- 重要度の意味
  - CRITICAL: セキュリティ脆弱性 / データ損失。マージブロック
  - HIGH: バグ・大きな品質問題。マージ前に修正推奨
  - MEDIUM: 保守性・可読性の懸念
  - LOW: スタイル・軽微な提案
- セキュリティ影響がある場合は `.claude/skills/security-review/SKILL.md` を併用する
- AWS 構成変更がある場合は `.claude/skills/aws-cost-review/SKILL.md` を併用する
- 既存の `.claude/instructions/*` と矛盾していないかを必ず確認する
- 1 PR 1 目的になっているかを確認する
- 改善案は具体的（できればコードスニペット）に書く

## 出力フォーマット

```txt
## サマリ
- ブロッカー: <CRITICAL / HIGH の件数>
- 推奨: <MEDIUM の件数>
- 任意: <LOW の件数>

## 指摘一覧（重要度順）
### CRITICAL / HIGH
（指摘ブロックを並べる）

### MEDIUM
（同上）

### LOW
（同上）

## 良かった点

## 追加で確認したい質問
```

## 禁止事項

- 重要度を付けずに長文だけ返す
- 根拠を書かずに「直してください」とだけ伝える
- スタイル指摘だけを並べて機能・セキュリティを見ない
- 1 つの指摘に複数論点を詰め込みすぎる
- レビューの場で勝手に大規模な設計変更を要求する（必要なら ADR を別途求める）
