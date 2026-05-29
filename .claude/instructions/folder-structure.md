# フォルダ構成ルール

このファイルはリポジトリ全体のフォルダ構成方針を扱う。
アプリ固有の詳細構成は、対応する instructions に記載する。

- `apps/api` の詳細構成: `.claude/instructions/api.md`
- `apps/frontend` の詳細構成: `.claude/instructions/frontend.md`
- `infra/cdk` の詳細構成: `.claude/instructions/infra.md`

## 1. トップレベルは責務別

トップレベルでは技術レイヤー名ではなく、責務でディレクトリを切る。

- `apps/`: 実行されるアプリケーション（`frontend`・`api` など）
- `packages/`: 複数アプリから共有される部品・コンテンツ（`content`・`shared`）
- `infra/`: AWS CDK などの IaC（`cdk`）
- `tools/`: ローカル開発・CI・運用補助のスクリプトと fixture
- `docs/`: 開発ドキュメント（開発者および PO および AI が参照する）
- `.github/`: GitHub Actions 設定
- `.claude/`: Claude Code 設定（スキル・コマンド・instructions）
- ルートの設定ファイル（`package.json`・`.prettierrc` など）

ルート直下に `src/` や `lib/` を作らない。

## 2. アプリ内部は機能・ドメイン別

`apps/*/src/` の内側では、機能・ドメイン単位で分割する。

良い例（`apps/ranking-api/src/`）:

```txt
apps/ranking-api/src
  - popular-posts/
    - handler.ts
    - getPopularPosts.ts
    - popularPostRepository.ts
    - popularPostSchema.ts
    - getPopularPosts.test.ts
  - shared/
    - http.ts
    - s3.ts
```

技術レイヤー名（`handler`・`service`・`repository`・`schema`）は、機能フォルダの **内側** でだけ使う。

## 3. `shared` を肥大化させない

- 複数機能から自然に使われ、特定画面・API に依存しないものだけを置く
- Vue コンポーネント / AWS SDK 依存 / Web 専用 / API 専用 は置かない
- 「便利だから」を理由に `shared` を増やさない

## 4. 関連ファイルは近接配置する

- 実装・テスト・型・schema は同じ機能フォルダに置く
- 1機能のテストを別ツリーに分散させない

## 5. ドキュメント構造はユーザー定義を優先

- `docs/` 配下の章立てや配置はユーザーが定める
- Claude が勝手に詳細構造を固定しないが、必要に応じて提案はする
- ドキュメントの内容や構成に関する提案は、まずユーザーに確認してから行う

## 6. 採用しない構成

- 技術別トップレベル（`components/`・`hooks/`・`services/` をルート直下）
- 全てを `shared` に詰め込む構成
- 技術検証に対する過剰な Clean Architecture / DDD 構成

これらを新たに導入する場合は ADR で背景・代替案・採用しない条件を明示する。

## 7. `packages/shared` の方針

```txt
packages/shared/
  - src/
    - types/
    - schemas/
    - utils/
  - package.json
```

`shared` に **置いてよい** もの:

- API レスポンス型
- 共通 schema
- URL に関する純粋関数
- 複数アプリから自然に参照される型

`shared` に **置かない** もの:

- Vue コンポーネント
- AWS SDK に依存するコード
- Web 専用ロジック
- API 専用ロジック
- 1つの機能でしか使わないコード

`shared` は便利な置き場ではなく、明確に共有されるものだけを置く。

## 8. `tools/` の推奨構成

```txt
tools/
  - fixtures/
    - cloudfront-logs/
  - scripts/
    - check-env.ts
    - clean.ts
    - generate-local-config.ts
  - zap/
    - zap-baseline.conf
    - README.md
  - vrt/
    - regconfig.json
    - README.md
  - docker/
    - docker-compose.yml
    - bin/
```

方針:

- ローカル検証や CI 補助のスクリプトを置く
- 本番アプリの実装コードは置かない
- CloudFront ログのサンプル・ZAP / VRT 設定など、開発補助に必要なものを置く

## 9. 配置判断ルール

### 機能フォルダに置くべきもの

次の質問に「はい」と答えられるものは機能フォルダに置く。

> そのファイルは特定の機能の言葉で説明できるか？

例:

- `articles/articleSchema.ts`
- `tags/tagQuery.ts`

### `shared` に置くべきもの

次の条件を **すべて** 満たすものだけを `shared` に置く。

- 複数機能から使われる
- 特定の画面や API に依存しない
- 純粋関数・型・schema・設定として説明できる

例:

- `shared/http/jsonResponse.ts`
- `shared/aws/s3.ts`
- `packages/shared/src/types/popularPost.ts`

### 技術レイヤー名を使ってよい場所

`handler`・`service`・`repository`・`schema` などの技術レイヤー名は **機能フォルダの内側でのみ** 使う。

## 10. 新規ファイル作成時の手順

新しいファイルを作るとき、以下を守る。

1. 機能・ドメイン単位の配置先をまず検討する
2. 技術レイヤー別フォルダをトップレベルに新設しない
3. 関連するテスト・型・schema を実装ファイルの近くに置く
4. `shared` に置く前に、本当に複数機能から使われるかを確認する
5. 既存構成に従い、独自判断で新しい構成パターンを増やさない
