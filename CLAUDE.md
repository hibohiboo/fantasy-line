# fantasy-line プロジェクト設定

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

## 設計ドキュメントの横断更新ルール

仕様・表示形式を変更する際は、1ファイルだけ直して終わりにしない。
変更対象に関係する設計ドキュメントをすべて洗い出してから横断的に更新すること。

- 変更前に影響ドキュメント一覧を示す（引継ぎ文書 `docs/sprints/sprint*/PBI-*.md` の「作成済みドキュメント一覧」を参照）
- PO向け（`docs/design/screen/`）・開発者向け（`docs/design/detail/screen/`）・スタイルガイド（`docs/design/style-guide.md`）は別ファイルに分かれているため、どれか1つを変えたら残りも必ず確認する
- 各ドキュメントの `## 変更履歴` テーブルにも追記する
