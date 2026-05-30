---
last_updated: 2026-05-05
---

# インフラ設計方針

## 対象読者

インフラ・バックエンド担当の開発者。Lambda 関数を追加・変更するすべての PBI で参照すること。

---

## CDK スタック構成

インフラは AWS CDK (TypeScript) で管理する。エントリポイントは `infra/lib/infra-stack.ts`。

主なリソース:

| リソース | 用途 |
|---|---|
| VPC（Private Isolated サブネット） | Lambda・Aurora を外部から隔離 |
| Aurora MySQL Serverless V2 | アプリケーション DB |
| Lambda（NodejsFunction） | 各 API ハンドラー |
| Lambda Layer（SharedDepsLayer） | Lambda 間で共有する npm パッケージ |
| API Gateway（RestApi） | HTTP エンドポイント |
| Secrets Manager VPC Endpoint | Lambda が DB 認証情報を取得するための VPC 内経路 |

---

## Lambda Layer

### 目的

Lambda 関数が増えるにつれて同一の npm パッケージが各 Lambda バンドルに重複しないよう、共有依存関係を Layer に切り出す。これにより:

- 各 Lambda のデプロイパッケージを軽量化する
- 依存関係の更新を Layer 1 か所で管理できる

### 構成

| ファイル | 役割 |
|---|---|
| `infra/layer/package.json` | Layer に含める npm パッケージのバージョン定義 |
| `infra/lib/infra-stack.ts` の `SharedDepsLayer` | CDK の `LayerVersion` 定義。デプロイ時に `npm install` を実行して `/opt/nodejs/node_modules/` に配置する |

### 現在 Layer に含まれるパッケージ

| パッケージ | 用途 |
|---|---|
| `drizzle-orm` | ORM（全 DB 接続 Lambda で使用） |
| `mysql2` | MySQL ドライバー（全 DB 接続 Lambda で使用） |
| `zod` | スキーマバリデーション（全 DB 接続 Lambda で使用） |

`@aws-sdk/*` は Lambda ランタイム（Node 24）に標準搭載されているため Layer 不要。

### esbuild との連携

`lambdaDefaults.bundling.externalModules` に Layer 内のパッケージを列挙することで、esbuild がそれらをバンドルに含めなくなる。Layer に追加したパッケージは必ず `externalModules` にも追記すること。

```ts
// infra/lib/infra-stack.ts
bundling: {
  externalModules: ['@aws-sdk/*', 'drizzle-orm', 'mysql2', 'zod'],
}
```

### Layer にパッケージを追加する手順

1. `infra/layer/package.json` の `dependencies` にパッケージとバージョンを追加する
2. `infra/lib/infra-stack.ts` の `lambdaDefaults.bundling.externalModules` に同じパッケージ名を追加する
3. `npm run build`（infra）で型チェックを通す
4. このドキュメントの「現在 Layer に含まれるパッケージ」テーブルを更新する

### 適用対象の Lambda

`lambdaDefaults` を使用する Lambda 関数すべてに自動で適用される。`echoFunction` のように `lambdaDefaults` を使わない軽量 Lambda は対象外。

---

## Lambda 関数の追加手順

1. `apps/api/src/<feature>/<ハンドラー名>.ts` にハンドラーを実装する（feature は `village` / `resident` / `item` / `echo` など機能名）
2. `infra/lib/infra-stack.ts` に `NodejsFunction` を `lambdaDefaults` を使って定義する
3. DB へのアクセスが必要な場合は `auroraCluster.secret!.grantRead(<function>)` を追加する
4. API Gateway リソースにメソッドを追加する（新規パスの場合は `api.root.addResource(...)` も追加）
5. `npm run build`（infra）で型チェックを通す

---

## 変更履歴

| PBI | 変更日 | 変更内容 |
|---|---|---|
| PBI-001 | 2026-05-05 | 初版作成。Lambda Layer（SharedDepsLayer）導入、createVillage・listVillages Lambda 追加 |
| PBI-019 | 2026-05-30 | Lambda追加手順のハンドラーパスを `src/handlers/` → `src/<feature>/` に更新 |
