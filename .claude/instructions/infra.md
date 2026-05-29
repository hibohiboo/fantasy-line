# AWS CDK 指針

このファイルは AWS CDK 実装で常時守るべき方針を簡潔に定める。
詳細手順は `.claude/skills/aws-cdk-patterns/SKILL.md` および
`.claude/skills/aws-cost-review/SKILL.md` を参照する。

---

## 1. CDK の基本方針

- TypeScript で記述する（プロジェクトの言語統一）
- 最初から細かく Stack を分割しない
  - 監視・ドメイン・ログが複雑になってから分割する
- 1 Stack 1 責務を意識し、Stack 内では Construct で機能ごとに整理する
- アプリケーションコードと CDK コードを密結合させない（CDK から `apps/*/src/` を直接 import しない）

## 2. 低コスト構成（最優先制約）

- 配信は **S3 + CloudFront** を中心に組む
- VPC を作る必要があるか毎回見直す。不要なら作らない
- WAF など有料機能の導入は ADR で背景・代替案・採用しない条件を明示してから
- AWS Budgets を前提とし、予算超過時にアラートが飛ぶ構成にする

## 3. API Gateway + Lambda

- OWASP ZAP の検査対象として扱う
- Lambda メモリ・タイムアウトは控えめに設定し、必要があれば後から上げる
- API Gateway はキャッシュを入れる前にコスト影響を確認する

## 4. IAM 最小権限

- 各 Construct / Lambda に最小限の権限のみ付与する
- ワイルドカード（`Resource: "*"` / `Action: "*"`）を避ける
- 共有 Role を使いまわさず、リソース単位で Role を作る
- 例外的に広めの権限をつける場合は、コードコメントと cdk-nag suppression に理由・影響・見直し条件を残す

## 5. ログとリテンション

- 全ての Lambda / API Gateway / CloudFront のログ保持期間を明示する
- 本プロダクトでは 30 日〜90 日を目安とする
- CloudFront アクセスログを S3 に保存する場合、保持期間とライフサイクルを設定する
- ログに個人情報や認証情報が混ざらないようマスキング方針を保つ

## 6. 環境差分

- 環境は `dev` / `prod` を意識し、`cdk.context.json` または環境変数で切り替える
- 本番にだけ有効な機能（独自ドメイン、ログ転送、アラート）は明確に分ける
- 環境名を Stack 名・リソース名に含めて衝突を防ぐ

## 7. cdk-nag（必須）

- `cdk-nag` を必ず導入する
- `AwsSolutionsChecks` など適切な NagPack を全 Stack に適用する
- `cdk synth` 実行時に警告・エラーが出る構成を維持する
- CI で cdk-nag を実行する（警告を放置しない）
- 抑制（suppression）を追加する場合は、以下を必ず残す
  - 抑制した理由
  - その判断による影響
  - 見直し条件（いつ再評価するか）

抑制コメント例:

```ts
NagSuppressions.addResourceSuppressions(bucket, [
  {
    id: 'AwsSolutions-S1',
    reason:
      'CloudFront ログ保存用バケットでありアプリケーションデータを保存しないため、' +
      'サーバーアクセスログ要件は適用しない',
    // 影響：ログデータの機密性は低いが、保持期間とアクセス権限は別途制御する
    // 見直し条件：ログに個人情報や認証情報が含まれる可能性が出た場合
  },
]);
```

## 8. テスト

- `cdk synth` がエラーなく通る状態を維持する
- スナップショット / アサーションテストを `infra/cdk/test/` に置く
- 主要な不変条件（暗号化必須、公開設定の意図、Tag 付与、ログ保持期間など）をテストで固定する

## 9. MCP の利用

- AWS CDK MCP Server / cdk-nag MCP Integration が利用可能な場合、CDK の設計案・コード・レビューに利用する
- ただし MCP の結果のみで合格扱いにしない
- CI 上の `cdk synth` と cdk-nag 検査を最終判断とする
- MCP 結果と CI 結果が矛盾する場合は CI 結果を優先する
- 詳細は `.claude/settings.json` および `.claude/skills/aws-cdk-patterns/SKILL.md`

## 10. やってはいけないこと

- 「とりあえず管理者権限」で IAM Role を作る
- 公開バケットを意図せず作る（`blockPublicAccess` を必ず確認する）
- ログ保持期間を「無期限」にする
- 検証コードに本番アカウント認証情報を含める
- cdk-nag を CI から除外する / 警告を一括無視する

## 11. 推奨フォルダ構成（`infra/cdk`）

```txt
infra/cdk
  - bin/
    - app.ts
  - lib/
    - blog-site/
      - BlogSiteStack.ts
      - SiteBucket.ts
    - api/
      - RankingApiStack.ts
      - ApiGateway.ts
    - batch/
      - BatchStack.ts
      - EventSchedule.ts
    - shared/
      - tag.ts
      - nagSuppressions.ts
  - test/
    - blog-site.test.ts
    - api.test.ts
    - batch.test.ts
  - cdk.json
  - package.json
  - tsconfig.json
```

方針:

- `bin/app.ts` で各 Stack を組み立てるだけにする
- `lib/<関心領域>/` 単位で Stack と Construct をまとめる
- 個別の Construct（バケット、配信、Lambda 等）は機能フォルダ内に分割して読みやすく保つ
- `lib/shared/` には Tag 戦略や cdk-nag 抑制ヘルパーなど横断的なものだけを置く
- アプリ実装側の `apps/*/src/` を CDK から直接 import しない
- `test/` には `cdk synth` のスナップショット / アサーションテストを置く
