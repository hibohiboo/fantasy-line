---
name: backend-patterns
description: 小さな API Gateway + Lambda を、薄い handler・機能別配置・ローカル再現性を保って実装するパターン集
---

# バックエンド パターン Skill

---

## 目的

- handler を薄く保ち、機能フォルダで凝集度を高める
- ローカルで再現できるテスト・実行環境を保つ
- AWS SDK 依存を境界に閉じ込める

## 使用するタイミング

- 新しい Lambda エンドポイントを追加するとき
- 既存ユースケース関数の責務を整理するとき
- S3 / EventBridge など外部依存を追加するとき
- ローカル実行と CI の差を縮めたいとき

## 手順

### 1. 機能フォルダを切る

`apps/api/src/<feature>/` の中に必要なファイルを揃える。

```txt
apps/api/src/popular-posts/
├── handler.ts                  // Lambda エントリ
├── getPopularPosts.ts          // ユースケース関数（純粋寄り）
├── popularPostsRepository.ts   // S3 などへのアクセスを隔離
├── popularPostsSchema.ts       // zod スキーマ
├── popularPostsTypes.ts        // ドメイン型（必要なら）
└── getPopularPosts.test.ts     // ユースケースのテスト
```

### 2. handler は 4 ステップだけ

```ts
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { parseQuery } from './parseQuery';
import { getPopularPosts } from './getPopularPosts';
import { jsonResponse } from '../shared/http';
import { s3Repository } from './popularPostsRepository';

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const params = parseQuery(event.queryStringParameters);
  const result = await getPopularPosts({ ...params, repo: s3Repository });
  return jsonResponse(200, { data: result });
};
```

- handler でビジネスロジックを書かない
- 例外は handler の手前で捕まえ、`jsonResponse` でエラー応答に整形する

### 3. ユースケース関数は純粋寄りに保つ

- 引数で依存（リポジトリ・現在時刻・ロガー）を受け取る
- 内部で `new S3Client()` などを作らない
- これによりテストでは fake repository を渡すだけで網羅できる

```ts
interface Repo {
  load(): Promise<unknown>;
}

export async function getPopularPosts({
  n = 10,
  repo,
}: {
  n?: number;
  repo: Repo;
}) {
  const json = await repo.load();
  const parsed = popularPostsSchema.parse(json);
  return parsed.slice(0, n);
}
```

### 4. リポジトリは AWS SDK 依存をここだけに閉じ込める

```ts
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const client = new S3Client({});

export const s3Repository = {
  async load(): Promise<unknown> {
    const res = await client.send(
      new GetObjectCommand({
        Bucket: process.env.RANKING_BUCKET!,
        Key: 'popular-posts.json',
      }),
    );
    const text = await res.Body?.transformToString();
    return text ? JSON.parse(text) : [];
  },
};
```

### 5. 入力検証は zod に集約する

- クエリ・パス・ボディ・ヘッダの全項目を schema 化
- `unknown` で受けて narrow する
- 検証失敗は 400 系で「攻撃に有利な情報を含まない」メッセージを返す

### 6. エラーレスポンスを統一する

- レスポンス整形は `shared/http.ts` の `jsonResponse` に集約
- エラーは独自エラークラス + status code でハンドルする

```ts
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
```

### 7. ローカル実行と fixture

- `tools/fixtures/popular-posts.json` を用意する
- 環境変数で「本物の S3」と「ローカル fixture」を切り替える
- `npm run local:api` 相当のコマンドで Lambda を擬似的に実行できる構成を維持する

### 8. ログ

- 構造化（JSON）でログを出す
- リクエスト ID（API Gateway の `requestId`）を必ず含める
- 機微情報（トークン、PII、生のクエリ全部）は出さない

## チェックリスト

エンドポイント追加時に確認する。

- [ ] handler が 4 ステップに収まっているか
- [ ] ユースケース関数が依存を引数で受けているか
- [ ] AWS SDK 依存がリポジトリ層に閉じているか
- [ ] 入力検証が zod で境界に集約されているか
- [ ] エラーレスポンスが統一フォーマットか
- [ ] ローカルで fixture を使って動かせるか
- [ ] 構造化ログで requestId を含めているか
- [ ] テスト（fake repository 差し替え）が追加されているか

## 禁止事項

- handler にビジネスロジックを詰め込む
- ユースケース関数で直接 `new S3Client()` する
- エラー応答にスタックトレースや内部情報を含める
- 環境変数を直接コードに書く（`process.env` は必ず存在確認するか CDK で inject）
- グローバル変数でミュータブルな状態を持つ
