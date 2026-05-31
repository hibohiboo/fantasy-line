---
name: webapp-testing
description: Vitest / Playwright / reg-suit / OWASP ZAP / API テストを、このプロジェクトのスコープで運用するための手順
---

# Web アプリテスト Skill

このプロジェクトのテスト方針は `.claude/instructions/testing.md` に
集約している。本 Skill は、そこから先の「具体的なツール運用」を扱う。

---

## 目的

- 単体・E2E・VRT・セキュリティ検査を、ローカルと CI で同じ手順で動かす
- VRT は代表ページに絞り、肥大化させない
- フィードバックループを短く保つ（壊れにくく速いテスト）

## 使用するタイミング

- 新しい機能のテストを書くとき
- E2E / VRT の対象を見直すとき
- ZAP の検査範囲を変更するとき
- ローカルと CI の挙動差を埋めるとき

## 手順

### 1. テストツールの役割を分ける

| ツール | 役割 |
|---|---|
| Vitest | 単体・結合テスト |
| Playwright | E2E、ブラウザ操作の検証 |
| reg-suit | VRT（スクリーンショット差分検出） |
| OWASP ZAP | API の動的セキュリティ検査 |

### 2. ローカルで CI と同じコマンドを走らせる

ルート `package.json` に集約する想定。

```bash
npm run typecheck
npm run lint
npm run test          # Vitest
npm run e2e           # Playwright
npm run vrt           # Playwright + reg-suit
npm run zap           # ZAP（必要なら）
```

CI ジョブもこれと同じ script を呼ぶ。

### 3. Playwright（E2E）

- 主要導線を中心にする
- セレクタは `data-testid` または role / accessible name を優先する
- 待機は `waitForSelector` / `waitForURL` を使い、`waitForTimeout` を多用しない
- スクリーンショットは失敗時に自動取得する

```ts
import { test, expect } from '@playwright/test'

test('homepage shows latest articles', async ({ page }) => {
  await page.goto('http://localhost:3000')
  await expect(page.locator('h1')).toBeVisible()
  await expect(page.getByRole('link').first()).toBeVisible()
})
```

### 4. reg-suit（VRT）

- 対象: トップ / 代表記事 / タグ一覧 / アーカイブ / 人気記事 など 5〜10 ページ程度
- 全記事 VRT は **行わない**
- 差分が出たら必ず人がスクリーンショットを比較してから承認する
- 一括ベースライン更新は禁止（差分の意味を必ず確認する）

### 5. OWASP ZAP

- API Gateway + Lambda の各エンドポイントを対象にする
- ZAP のレポートは CI 成果物として保存する
- 警告を suppress する場合は理由を残す
- `tools/zap/` 配下に baseline 設定を置き、再現可能にする

### 6. fixture とローカル API

- ランキング API は `tools/fixtures/popular-posts.json` でローカル動作可能にする
- フロントエンドからの fetch 先は環境変数で切り替える
- これにより S3 接続なしでも E2E が回る

### 7. flaky 対策

- 待機を「明示的な条件待ち」にする
- 時刻・乱数・並行 IO を fake / fixture に置き換える
- どうしても再現困難な flaky は Issue 化する（retry で逃げない）

### 8. レポートの読み方

- Vitest: `npm run test -- --reporter=verbose` で詳細
- Playwright: `--reporter=list,html` で HTML レポートを成果物保存
- reg-suit: PR コメントの差分画像を毎回確認する
- ZAP: HTML レポートを成果物として保存し、警告レベルで分類する

## チェックリスト

- [ ] テストの種類（単体 / 結合 / E2E / VRT）が適切に選ばれているか
- [ ] ローカルで CI と同じコマンドが通るか
- [ ] VRT 対象が代表ページに収まっているか
- [ ] flaky 対策（待機・乱数・並行 IO）が入っているか
- [ ] 失敗時のスクリーンショット・ログが取れる構成か
- [ ] ZAP / CodeQL の警告に対応 or 抑制理由が残っているか
- [ ] 環境差を `tools/fixtures/` で吸収できているか
- [ ] CI 成果物（HTML レポート、画像）が保存されるか

## 禁止事項

- 全記事 VRT を導入する
- VRT のベースライン画像を一括更新で承認する
- `waitForTimeout(5000)` で誤魔化す
- E2E から本物の AWS リソースを叩く（権限・コスト・状態破壊リスク）
- ZAP / CodeQL の警告を理由なし suppress
- スキップ・retry に依存して flaky を見送る
