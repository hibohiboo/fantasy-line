# 振り返りレポート — 2026-05-06

## 概要

fantasy-line は「架空の村の生活を管理する」Webサービスである。村・住人・職業・生活リズムをユーザーが定義すると、時間変化に基づいた1日シミュレーションが自動生成される。作家・TRPG プレイヤー・個人ユーザーが「設定を入力すると世界が勝手に動き出す」体験を目的とした SaaS プロダクト。

---

## 作ったもの

### アーキテクチャ図

```
ブラウザ（Vue 3 + Vite + Pinia + Vue Router + Vuetify 4）
        │
        ▼
API Gateway（REST API）
        │
   ┌────┴──────────────────┐
   │                       │
Lambda（Node.js 24）  Lambda（Node.js 24）
createVillage          listVillages
   └──────────┬────────────┘
              │ Drizzle ORM
              ▼
Aurora MySQL Serverless V2（本番）
MySQL 8.0 on Docker（ローカル開発）
              │
 Secrets Manager（DB認証情報）
 VPC Private Subnet（Lambda・Aurora 分離）
```

ローカル開発時は `SAM CLI` を使用して Lambda をエミュレートし、Docker MySQL に接続する。

### モノレポ構成

| 種別 | パッケージ名 | 役割 |
|---|---|---|
| app | `@fantasy-life/api` | Lambda ハンドラー・Drizzle ORM・DB マイグレーション |
| app | `@fantasy-life/frontend` | Vue 3 SPA（村の作成・一覧表示） |
| infra | `infra` | AWS CDK（VPC・Aurora・Lambda・API Gateway） |
| package | `@repo/schema` | Zod スキーマ（API・フロント間の型共有 Single Source of Truth） |
| package | `@repo/eslint-config` | ESLint 共通設定 |
| package | `@repo/typescript-config` | TypeScript 共通設定 |

---

## 技術選定の判断

| 技術 | 選定理由（コードから読み取れる事実） |
|---|---|
| **Vue 3 + Pinia + Vue Router** | `apps/frontend/package.json` に明記。`vue@3.5.33`・`pinia@3.0.4`・`vue-router@5.0.6` を使用 |
| **Vuetify 4（MD3）** | `docs/design/style-guide.md` に「Material Design 3 がデフォルト。Vuetify に存在するコンポーネントは自作しない」と明記。カスタム CSS を最小化しつつアースカラーテーマを適用 |
| **Zod（共有スキーマ）** | `packages/schema` に `village.ts` を配置し、API ハンドラー・フロントエンドの両方が `@repo/schema` を参照。バリデーションルールを一箇所に集中させ、フロントのスキーマ駆動バリデーション（`CreateVillageSchema.shape.name.safeParse()`）も実現 |
| **Drizzle ORM** | `apps/api/package.json` の依存に `drizzle-orm`・`drizzle-kit` を採用。`drizzle-kit generate` によるマイグレーション自動生成・手書き SQL 禁止をドキュメントに明記 |
| **AWS CDK** | `infra/` で CDK を使用。VPC・Aurora・Lambda・API Gateway・Secrets Manager・EC2 Instance Connect Endpoint をコードで管理 |
| **Aurora MySQL Serverless V2** | `infra/lib/infra-stack.ts` に `serverlessV2MinCapacity: 0.5`・`serverlessV2MaxCapacity: 4` を設定。コスト最小化のため最小容量を抑えた構成 |
| **Lambda Layer** | `infra/layer/` に `drizzle-orm`・`mysql2`・`zod` を集約。Windows の CDK bundling で発生する EPERM 問題を回避するため、CDK の bundling 機構を使わず Layer を事前 `npm install` してから `fromAsset` で zip する方式を採用 |
| **Testcontainers** | `apps/api/tests/helpers/use-mysql-container.ts` で MySQL コンテナを起動。Medium テスト（ハンドラー + 実 DB）の実行環境として使用 |
| **Playwright** | E2E 受け入れテストに採用。`apps/frontend/e2e/village.spec.ts` に Gherkin シナリオ 6 件を実装 |
| **MSW（Mock Service Worker）** | `apps/frontend/src/mocks/` に配置。`dev:mock` モード（`vite --mode mock`）でバックエンドなしに開発できる環境を整備 |
| **oxlint + ESLint** | フロントエンドの lint は `lint:oxlint`（高速）→ `lint:eslint` の直列実行（`npm-run-all2` の `run-s`）で構成 |
| **npm workspaces** | `package.json` の `workspaces: ["packages/*", "apps/*"]` でモノレポを管理。bun は使用しない（CLAUDE.md に明記） |

---

## 実装して良かったこと

### 1. スキーマ駆動のバリデーション

`packages/schema/src/village.ts` に `CreateVillageSchema` を定義し、API ハンドラーとフロントエンドの両方が参照する構成を採用した。これにより:

- API: `CreateVillageSchema.parse()` でリクエストボディを検証
- フロントエンド: `CreateVillageSchema.shape.name.safeParse()` でフォームバリデーション
- テスト: スキーマ境界値テスト（`packages/schema/src/village.test.ts`）が単一の責務を担い、ハンドラーテストで同じルールを繰り返さない

引継ぎノート（`docs/sprints/sprint1/PBI-001.md`）に「バリデーション実装を独自実装からスキーマ駆動に変更」と記録されており、途中でリファクタリングした設計判断が正解だったと確認できる。

### 2. テストサイズ分類（Small / Medium / Large）

`docs/design/non-functional/testing.md` に分類基準を明文化し、全テストファイルがこの命名規則に従っている:

- `*.small.test.ts` / `*.small.spec.ts` — DB モックなし・単一関数・コンポーネント
- `*.medium.test.ts` / `*.medium.spec.ts` — 実 DB（Testcontainers）・View 結合
- `e2e/*.spec.ts` — Playwright E2E

バックエンド 9 ファイル + フロントエンド 5 ファイル + E2E 1 ファイル の計 15 テストファイルがこの規則で整理されている。

### 3. Lambda Layer の Windows 対応

CDK bundling 機構（Docker ベースの temp dir rename）が Windows で EPERM エラーになる問題に対して、`infra/lib/infra-stack.ts` で `node_modules が存在しない場合のみ npm install を実行` する方式を採用。`execSync` を条件付きにすることで `cdk diff/synth` のたびに副作用が走らない設計にした（コードレビュー P2 指摘への対応）。

### 4. E2E テストでの document リクエスト除外

`page.goto('/villages')` が発行する HTML ドキュメントリクエストが `**/villages` のルートモックパターンにマッチしてしまう問題を、`resourceType() === 'document'` の場合は `route.continue()` でスルーする方式で解決した。この知見は引継ぎノートに記録済み。

---

## 苦労したこと・課題

### 1. Windows 環境特有の問題が複数発生

- **CDK bundling の EPERM**: Lambda Layer のビルドで Windows の temp ディレクトリ rename が EPERM で失敗。`node_modules` 存在チェックによる条件付き `npm install` で回避（`infra/lib/infra-stack.ts`）。
- **WSL 必須の SAM CLI**: ローカル API 実行は `wsl -d Ubuntu -- bash -lc 'sam local start-api ...'` として WSL 経由でのみ動作する（`infra/package.json` の `local-api` スクリプト）。
- **Vuetify の依存破損**: `1af9d0b` コミット（`package-lock.json を消して vuetify を再インストール`）が残っており、依存関係が一時期壊れていたことが確認できる。

### 2. E2E テストで判明した仕様の曖昧さ

Scenario 4（128文字超バリデーション）の受け入れ条件を、実装後に「129文字入力→エラーメッセージ表示」から「`maxlength="128"` によりブラウザが入力をブロックすること」に変更した。この変更は引継ぎノートに2回記録されており（セッション3・セッション4）、PBI・設計ドキュメント・E2E テストの横断更新が必要だった。

### 3. Playwright の複数ユーザー切り替え

Scenario 5・6 で複数ユーザーの操作確認が必要だったが、`browser.newContext()` を使わずに単一ページで `page.goto('/')` → `page.evaluate(setItem)` → `page.goto('/villages')` のパターンで解決した。`localStorage` が同一 origin でページをまたいで持続する特性を活用した実装。

### 4. コードレビューで発覚した問題

`PBI-001-review.md` に記録された指摘事項:

| 重大度 | 問題 | 対応 |
|---|---|---|
| P1 | createVillage で認証チェックがバリデーション後（攻撃者が不正データを送れる） | 認証チェックを JSON パース前に移動して修正済み |
| P2 | CDK スタック内 `execSync('npm install')` が `cdk diff/synth` のたびに実行される副作用 | 条件付き実行に修正済み |
| P2 | E2E テストのモック ID 管理（並列実行リスク） | テスト間共有状態を解消済み |
| P3 | `test-results/.last-run.json` がコミットに含まれていた | `.gitignore` 追加・ファイル削除済み |

### 5. 未解決の仕様問題

村名がスペースのみの場合の許可可否が未定義のまま残っている（`PBI-001.md` の「不明点」欄・引継ぎノートに3回記録）。Zod の `min(1)` ではスペースのみの文字列が通過するため、仕様確定後に `trim()` または `.refine()` の追加が必要。

---

## 今後やること

| 優先度 | タスク | 根拠 |
|---|---|---|
| 🔴 最高 | PBI-001 Phase 10（lint・型チェック・ビルド確認）の完了 | 引継ぎノート（セッション4）で未着手と明記 |
| 🔴 最高 | PBI-001 Step 5（コードレビュー最終確認・クローズ） | 引継ぎノートで未着手と明記 |
| 🔴 最高 | PBI-014（ログイン機能）の実装 | 現在は `X-User-Id` ヘッダーによるモック認証。全 MVP PBI の前提 |
| 🟠 高 | 村名スペースのみの仕様確定・実装 | 3セッション連続で未解決として記録 |
| 🟠 高 | PBI-002（村の基本設定を編集する）の実装 | MVP ロードマップの次 PBI |
| 🟡 中 | PBI-003・004（住人の登録・編集）の実装 | PBI-001 完了後の MVP 継続タスク |
| 🟡 中 | `infra` の `npm run build`（Lambda Layer 対応後の型チェック）確認 | 引継ぎノート（セッション2）で「Phase 6 開始前に確認すること」と記載。その後確認済みか不明 |
| 🟢 低 | `owner_id` インデックスの追加 | 現フェーズ（≤10ユーザー）では不要と判断済み。ユーザー数増加時に対応 |
| 🟢 低 | CDK assertion テストの追加 | `infra/test/infra.test.ts` を削除した理由（保守コスト > 便益）を考慮しながら、将来的に費用対効果が逆転した時点で検討 |

---

## MVP ロードマップの進捗

```
PBI-014（認証）→ PBI-001（村） → PBI-003（住人） → PBI-005（職業） → PBI-007（1日生成） → PBI-008（村全体）

  🔲 未着手      🔶 進行中       🔲 未着手        🔲 未着手         🔲 未着手           🔲 未着手
```

PBI-001（村を作成する）の実装（Phase 1〜9.5）は完了しているが、lint・型チェック・最終レビューが残っている状態。
