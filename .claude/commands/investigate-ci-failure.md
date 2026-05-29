---
description: GitHub Actions の失敗を「最初に失敗した job 特定 → ローカル再現 → 修正案・再実行対象提示」の順で調査してもらう
---

# CI 失敗調査依頼

利用 Skill:

- `.claude/skills/ci-debugging/SKILL.md`
- 必要に応じて以下を併用
  - `.claude/skills/webapp-testing/SKILL.md`
  - `.claude/skills/aws-cdk-patterns/SKILL.md`
  - `.claude/skills/security-review/SKILL.md`

---

## 依頼内容

以下のテンプレートを埋めてから、CI 失敗を調査してください。

```txt
## 失敗した CI 実行
- リポジトリ:
- ワークフロー名 / Run URL:
- 対象ブランチ / コミット:

## 失敗の状況
- 失敗 job 名:
- 失敗ステップ:
- 直近の関連変更（PR / コミット）:

## 既に試したこと
- ローカル再現の有無:
- リトライしたか:
- 関連 Issue:

## 期待する成果物
- 原因の仮説 → 確証
- ローカル再現コマンド
- 修正案（コードまたは設定変更）
- 再実行対象の job
```

## 守ること

- `.claude/skills/ci-debugging/SKILL.md` の手順に従う
  1. 最初に失敗した job / ステップを特定する
  2. ローカル再現を試みる（Node バージョン一致の確認を含む）
  3. flaky か恒常的かを判定する
  4. 修正案を「根拠付き」で提示する
  5. 再実行すべき job を限定する
- 失敗ログは「最初のエラー」から読む
- スタックトレースを「自分のコード」「依存ライブラリ」に分ける
- 環境変数欠落や権限不足の可能性も確認する
- ジョブ種別ごとの典型原因（lint / typecheck / test / e2e / vrt / cdk synth /
  cdk-nag / SonarQube / ZAP）を踏まえる
- 「原因不明のまま re-run」を提案しない
- flaky と判定する場合は「retry で逃げる」を選ばず、対策案を提示する

## 出力フォーマット

```txt
## 失敗ジョブ
- name:
- step:
- exit code:

## 最初のエラー
（ログ抜粋）

## 仮説 → 確証
- 仮説 1:
- 検証手段:
- 結果:

## ローカル再現
- 必要な準備:
- コマンド:
- 期待される失敗 / 成功:

## 修正案
- 変更内容:
- 影響範囲:
- 副作用 / 注意点:

## 再実行対象
- job:
- 必要なら他 job への影響:

## 追加で確認したい質問
```

## 禁止事項

- 原因不明のまま `re-run all jobs` を提案する
- flaky と決めつけて retry で逃げる
- 失敗ログの最後だけ読んで判断する
- CI のログ全体を貼って終わりにする
- 一括 suppress（`eslint-disable-line` の量産、cdk-nag suppression、
  test.skip 連発）で通すだけの状態を作る
- 本番アカウントへの書き込み試験を提案する
