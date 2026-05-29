# バックエンド（Lambda / API）指針

このファイルは `apps/api` 配下の Lambda / API 実装で常時守るべきルールを扱う。
詳細パターンは `.claude/skills/backend-patterns/SKILL.md` を参照する。

## 1. API Gateway + Lambda 前提

- API Gateway 経由で呼ばれる Lambda として実装する
- フレームワークの導入は最小限にする（Express, NestJS などは導入しない）
- 必要であれば軽量な手書きルータか型補助のみ導入する

## 2. Lambda handler は薄く保つ

handler は次の責務だけにする。

1. リクエストの受け取り
2. 入力検証（schema バリデーション）
3. ユースケース関数の呼び出し
4. レスポンスの成形

それ以外（S3 アクセス、ビジネスロジック、ログ整形）は機能フォルダ内の別関数に分離する。

```ts
export const handler = async (event: APIGatewayProxyEventV2) => {
  const params = parseQuery(event.queryStringParameters);
  const result = await getPopularPosts(params);
  return jsonResponse(200, result);
};
```

## 3. 機能別配置

- `apps/api/src/<feature>/` に機能単位で配置する
- 横断的なユーティリティ（HTTP ラッパー、S3 クライアント、エラー型）は `apps/api/src/shared/` に置く

## 4. ステートレス設計

- Lambda はステートレスとして設計する（インメモリキャッシュ前提にしない）
- グローバル変数は接続再利用などコールドスタート最適化目的のみ
- 並行呼び出しに耐えるよう、ミュータブル状態を関数スコープに閉じる

## 5. 不要なデータストアを導入しない

- DynamoDB / ElasticCache を入れる前に、
  - 本当に必要か
  - コスト見合いか
    をレビューする。導入する場合は ADR を残す

## 6. 入力検証

- すべての外部入力は `zod` などで検証する
  - クエリパラメータ、パスパラメータ、リクエストボディ、ヘッダ
- 検証失敗時は 400 系のステータスコードと、攻撃に有利な情報を含まないメッセージを返す

## 7. エラーレスポンス

統一フォーマットを規定にする。

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed"
  }
}
```

- ステータスコードは HTTP セマンティクスに従う（200 で全部返さない）
- エラー詳細にスタックトレース・SQL・内部 ID を含めない
- `console.error` 等のログは詳細を残してよい

## 8. ログ出力

- 構造化ログ（JSON）を基本とする
- 機微情報（トークン、PII: Personal Identifiable Information）はログに出さない
- リクエスト ID（API Gateway の `requestId`）を必ず含める
- レイテンシ・呼び出し回数の傾向を後で分析できる程度の項目を残す

## 9. AWS SDK 依存の隔離

- `@aws-sdk/*` への直接依存は機能内の薄いラッパーに閉じ込める
- ユースケース関数は SDK のクライアント型ではなく、自前のドメイン型を扱う
- これによりテストでは fake repository を差し替えやすくなる

## 10. ローカル実行と再現性

- ローカルで `npm run local:api` 相当のコマンドが動く構成を維持する
- `tools/docker` のようなローカル環境を用意し、外部の RDS なしでも動かせるようにする
- 環境変数で「本物の RDS / ローカル RDS」を切り替えられるようにする

## 11. やってはいけないこと

- handler に S3 アクセス・ビジネスロジック・整形ロジックを詰め込む
- 失敗時に、`error.message` をそのままレスポンスに含める
- `Resource: '*'` などワイルドカードな IAM 権限を Lambda につける（IAM は CDK 側で最小化する）
- 不要なミドルウェア・フレームワーク導入で見通しを悪くする

## 12. 推奨フォルダ構成（`apps/api`）

```txt
apps/api/
  - src/
    - popular-posts/
      - handler.ts
    - shared/
      - http.ts
      - errors.ts
      - s3.ts
```

方針:

- 機能ごとに「handler、ユースケース、リポジトリ、schema、テスト」を同じフォルダにまとめる
- handler は薄く保ち、ロジックは同フォルダの関数に移譲する
- AWS SDK 依存は機能内の薄いラッパーに閉じ込める
- 共通の HTTP ラッパー、エラー型、S3 クライアントは `shared/` に置く
- `handlers/` や `services/` などの技術レイヤー別フォルダをトップレベルに作らない
