---
name: ci-debugging
description: GitHub Actions（lint / typecheck / test / build / VRT / SonarQube / ZAP / cdk synth / cdk-nag）の失敗を、最初の失敗 job 特定 → ローカル再現 → 修正案提示の順で解決する
---

# CI 失敗調査 Skill

CI ジョブが失敗したときに、闇雲にログを読んで沼にはまらないための手順を最小限で定義する。

---

## 目的

- 最初に壊れたジョブを特定する
- ローカルで再現可能な状態を作る
- 修正案と再実行対象を明確に伝える

## 使用するタイミング

- GitHub Actions のジョブが失敗したとき
- PR チェックが赤になったとき
- 「main ではグリーンだが、別 PR で同じ失敗が出る」状況のとき

## 手順

### 1. 何が落ちたか確認する

- まず GitHub Actions の Run Summary を見る
- 失敗 job が複数あるなら、**最初に失敗したもの**を起点にする
- ジョブ名 / ステップ名 / コマンド / exit code をメモする

### 2. ジョブ種別ごとの典型原因

| ジョブ | 典型原因 |
|---|---|
| `lint` | フォーマット崩れ / ESLint ルール違反 / npm 依存の不整合 |
| `typecheck` | 新規コードの型エラー / 共有パッケージの型不整合 |
| `test`（Vitest） | 振る舞い変更 / fixture 古い / 時刻 / 乱数依存 |
| `e2e` / `vrt`（Playwright） | セレクタ崩壊 / ブラウザバージョン不一致 / flaky |
| `build` | 環境変数欠落 / TypeScript の build エラー |
| `cdk synth` | プロパティ不整合 / 互換性のない Construct 設定 |
| `cdk-nag` | 新リソースのセキュリティ警告 |
| `SonarQube` | カバレッジ低下 / 重複コード / セキュリティホットスポット |
| `ZAP` | 新エンドポイントのレスポンスや認証構成 |

### 3. ローカル再現の準備

- Node のバージョンが CI と一致しているか確認する
  - `package.json` の `engines` フィールドや `.nvmrc` を確認する
- 依存関係をクリーンインストールする
  - `npm ci`
- ジョブと同じコマンドを叩く
  - `npm run lint` / `npm run typecheck` / `npm run test` / `npm run build` 等
- Playwright は `npx playwright install` を忘れない

### 4. 失敗ログの読み方

- スクロールせず、まず **最初のエラー**から読む（後続は派生エラーが多い）
- スタックトレースから「自分のコード」「依存ライブラリ」を分ける
- リトライしている場合、同じエラーが続いているかを確認する
- 環境変数欠落・権限不足は CI 環境差を疑う

### 5. flaky の判定

- 同じ PR で複数回 retry したら通る → 高確率で flaky
- 解決策:
  - 時刻 / 乱数 / 並行 IO を fake / 固定値に置き換える
  - `waitForSelector` / `waitForResponse` で明示的待機を入れる
  - retry で逃げず、原因を Issue 化して対処する

### 6. 修正後の再実行

- 修正コミットを push し、CI 再実行する
- 影響範囲が小さいジョブから個別に再実行できるか検討する
- 同じ失敗を繰り返す場合、調査メモを PR に残す

### 7. 報告フォーマット

```txt
失敗ジョブ: <name>
ステップ: <command>
最初のエラー: <message>
原因（仮説 → 確証）:
ローカル再現: <command>
修正案:
影響範囲:
再実行対象: <job>
```

## チェックリスト

- [ ] 最初に失敗したジョブを特定したか
- [ ] ローカルで同じコマンドを再現したか
- [ ] エラーログの「最初のエラー」から読んだか
- [ ] 環境差（Node バージョン）を確認したか
- [ ] flaky か恒常的か判定したか
- [ ] 修正案を「根拠付き」で提示したか
- [ ] 同じ PR で他のジョブにも影響がないか確認したか

## 禁止事項

- 原因不明のまま `re-run all jobs` を連打する
- flaky と決めつけて retry で逃げる
- 失敗ログの最後だけ読んで判断する
- CI のログ全体を PR コメントに貼って終わりにする
- 一括 suppress（`eslint-disable-line` の量産、cdk-nag 抑制の濫用、test.skip 連発）で
  通すだけの状態にする
