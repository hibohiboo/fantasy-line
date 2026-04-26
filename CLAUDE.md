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
