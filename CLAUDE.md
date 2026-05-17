# fantasy-line プロジェクト設定

## このファイルの運用方針

詳細な作業手順・チェックリスト・レビュー観点などは以下に分離している。
**このファイルへの追記は「全領域に常時関わる方針」に限定し、肥大化させない。**

| 用途 | 場所 |
|---|---|
| リポジトリ横断ルール（全体に常時適用） | `.claude/instructions/*.md`（ルート `CLAUDE.md` から `@path` で参照） |
| パッケージ・ディレクトリ固有のルール | 各ディレクトリ配下の `CLAUDE.md` |
| スキル（特定タスクの詳細ワークフロー） | `.claude/skills/*/SKILL.md` |
| スラッシュコマンド（人間が明示的に呼び出す手順） | `.claude/commands/*.md` |
| MCP サーバ設定 | `.claude/settings.json` |

## プロジェクト概要

`README.md` に記載されているプロジェクトを実装するモノレポ。

- 学習目的として AWS・CI/CD・セキュリティ検査を扱う
- 個人プロジェクトのため、**AWS 利用料を低く抑えることが最優先制約のひとつ**

## 技術スタック

- フロントエンド: Vue 3 + Vite + Pinia + Vue Router + Vuetify 4（SSR前提）
- バックエンド: AWS Lambda (Node.js) + API Gateway / S3
- インフラ: AWS CDK (TypeScript)
- パッケージ管理: npm
- CI/CD: GitHub Actions
- 品質: ESLint / TypeScript strict / Vitest / Playwright / reg-suit / SonarQube
- セキュリティ: OWASP ZAP / GitHub CodeQL / Dependabot / cdk-nag
- ORM: Drizzle ORM
- DB: Aurora MySQL（本番） / Docker MySQL（ローカル）
- スキーマ共有: Zod (`packages/schema`)

## パッケージマネージャー

このプロジェクトは **npm** で管理する（bun は使わない）。

グローバルの CLAUDE.md にある `bun run test` / `bun run lint` などのコマンドは、
このプロジェクトでは `npm run test` / `npm run lint` に読み替えること。

```bash
npm run test   # テスト実行
npm run lint   # lint・型チェック
npm install    # 依存関係インストール
```

## ワークスペース構成

npm workspaces を使用。

- `packages/*` : 共有パッケージ（eslint-config, typescript-config など）
- `apps/*` : アプリケーション

## 実装の基本原則

- **ad-hoc な変更はしない。正しい設計に基づく正しいコードだけを書く**
- シンプルであることを最優先する
- AWS CDK を中心に IaC で構成を管理する
- セキュリティを重視し、入力検証と出力エンコードを徹底する
- テストを重視し、単体テストと代表的な VRT を行う

## AWS コスト抑制方針

- 常時起動リソース（NAT Gateway・ALB・ElastiCache 等）は可能な限り作らない
- 配信は S3 + CloudFront を中心に構成する
- 動的処理は呼び出し回数を意識した Lambda に限定する
- CloudWatch Logs と CloudFront ログは保持期間を明示する
- WAF など有料機能は導入条件を ADR に残してから採用する
- AWS Budgets の設定を前提とする

## フォルダ構成の原則

詳細は `.claude/instructions/folder-structure.md` を参照する。

最低限守る原則のみここに残す。

- トップレベルは責務別（`apps`・`packages`・`infra`・`tools`・`docs`・`.github`）
- アプリ内部は機能・ドメイン別
- 技術レイヤー別フォルダ（`handlers/`・`services/`・`repositories/` 等）をアプリ直下のトップレベルには作らない。必要なら機能フォルダの内側に閉じ込める
- `shared` には複数機能から本当に共有されるものだけを置く
- 関連する型・schema・テスト・実装はできるだけ近くに置く

## TypeScript strict 前提

- 全パッケージで TypeScript strict を有効にする
- `any` は原則禁止。やむを得ない場合は理由をコードコメントで明示する
- 外部入力（ユーザー入力・S3 JSON・API レスポンス・環境変数等）は `unknown` で受けて schema validation で絞り込む
- `enum` よりも文字列リテラル union を優先する
- ESM 前提で import / export を整理する

## テスト重視

- テストなしの実装変更は避ける
- 単体テストは Vitest を中心に、機能フォルダ内に近接配置する
- 全記事 VRT は行わない（コスト・時間・メンテ性の観点）
- ローカルで CI と同じ検証コマンドが実行できる構成を維持する
- 詳細は `.claude/instructions/testing.md` および `.claude/skills/webapp-testing/SKILL.md`・`.claude/skills/tdd-workflow/SKILL.md` を参照する

## セキュリティ重視

- 入力検証・出力エンコードのサニタイズを徹底する
- 秘密情報をリポジトリに含めない（`.env` は `.gitignore` に含めること）
- CDK では cdk-nag を導入し、警告を放置しない
- API Gateway + Lambda は OWASP ZAP の検査対象として扱う
- 詳細は `.claude/instructions/security.md` を参照する

## 新規ライブラリ導入時の判断基準

新しい依存関係を追加する場合は、以下を Pull Request 説明または ADR に明記する。

- 採用理由（解決したい問題は何か）
- 代替案（なぜそれを選ばないのか）
- 採用しない条件（将来撤退する基準）
- ライセンス
- メンテナンス状況（最終リリース・Issue の動向）
- セキュリティ・コスト・バンドルサイズへの影響

これを満たさない一時的な追加は避ける。

## ドキュメント構造はユーザー定義を優先

- ドキュメントの章立てや配置はユーザー（リポジトリ所有者）の指定を優先する
- Claude が勝手に詳細な構造を固定しない
- 必要に応じて提案はするが、まずユーザーに確認してから行う

## 設計ドキュメントの横断更新ルール

仕様・表示形式を変更する際は、1ファイルだけ直して終わりにしない。
変更対象に関係する設計ドキュメントをすべて洗い出してから横断的に更新すること。

- 変更前に影響ドキュメント一覧を示す（引継ぎ文書 `docs/sprints/sprint*/PBI-*.md` の「作成済みドキュメント一覧」を参照）
- PO向け（`docs/design/screen/`）・開発者向け（`docs/design/detail/screen/`）・スタイルガイド（`docs/design/style-guide.md`）は別ファイルに分かれているため、どれか1つを変えたら残りも必ず確認する
- 各ドキュメントの `## 変更履歴` テーブルにも追記する
