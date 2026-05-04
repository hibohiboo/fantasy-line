# fantasy-line

> 設定を入力すると、世界が勝手に動き出す

ファンタジー世界の村を、時間とともに振る舞い観察できる **"生きたシミュレーション"** として扱うサービス。

詳細は [docs/overview.md](docs/overview.md) を参照。

---

## コアコンセプト

このサービスの本質は「状態」ではなく「**時間変化**」を扱うこと。

村人はデータではなく、時間とともに変化する存在として設計される。

---

## アーキテクチャ

```
Browser (Vue 3)
    │
    ▼
API Gateway
    │
    ▼
Lambda (Node.js) ── Drizzle ORM ── Aurora MySQL (AWS RDS)
```

| 層 | 技術 |
|---|---|
| フロントエンド | Vue 3 + Vite + Pinia + Vue Router |
| バックエンド | Node.js (AWS Lambda) |
| スキーマ共有 | Zod (`packages/schema`) |
| ORM | Drizzle ORM |
| DB | Aurora MySQL（本番） / Docker MySQL（ローカル） |
| インフラ | AWS CDK |

---

## ディレクトリ構成

```
fantasy-line/
├── apps/
│   ├── api/          # Lambda ハンドラー・DB アクセス層
│   └── frontend/     # Vue 3 フロントエンド
├── packages/
│   ├── schema/           # Zod スキーマ（API/フロント共有）
│   ├── eslint-config/    # ESLint 共通設定
│   └── typescript-config/# TypeScript 共通設定
├── infra/            # AWS CDK インフラ定義
├── docker/           # ローカル開発用 Docker（MySQL）
└── docs/             # 設計・仕様ドキュメント
```

---

## 開発

```bash
npm install          # 依存関係インストール
npm run test         # テスト実行
npm run lint         # lint・型チェック
```

ローカル DB の起動・マイグレーションは [apps/api/README.md](apps/api/README.md) を参照。
