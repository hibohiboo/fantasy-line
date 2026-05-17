---
name: fantasy-line パッケージマネージャー
description: fantasy-line プロジェクトは npm で管理（bun は不使用）
type: project
---

このプロジェクトは npm で管理する（bun は使わない）。

**Why:** ユーザーが明示的に npm を指定。package.json に `"packageManager": "npm@11.4.2"` が設定済み、package-lock.json も存在する。

**How to apply:** グローバル CLAUDE.md の `bun run test` / `bun run lint` などのコマンドは、このプロジェクトでは `npm run test` / `npm run lint` に読み替える。`bun install` の代わりに `npm install` を使う。
