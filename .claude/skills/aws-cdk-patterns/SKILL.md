---
name: aws-cdk-patterns
description: 小規模の S3 + CloudFront / API Gateway + Lambda / EventBridge を、cdk-nag と MCP で守りながら実装するための最小プレイブック
---

# AWS CDK パターン Skill

このファイルは CDK 実装中の実務手順だけを扱う。常時ルールは
`.claude/instructions/infra.md` を参照する。
詳細は運用しながら段階的に拡張する。

---

## 目的

- 低コスト・最小権限・cdk-nag 準拠で構築する
- AWS CDK MCP Server / cdk-nag MCP Integration が利用可能なら活用する
- CI で `cdk synth` と cdk-nag が必ず動く状態を維持する

## 使用するタイミング

- 新しい Stack / Construct を追加するとき
- 既存リソースの構成（IAM、ログ、暗号化、ドメイン等）を変えるとき
- cdk-nag 警告が出たとき
- MCP の確認結果と CI 結果が食い違うとき

## 手順

### 1. 設計の前に確認する

- どのスタックに置くべきか（`site-stack` / `api-stack` / 別の新スタック）
- AWS CDK MCP Server / cdk-nag MCP Integration が動く環境か
- 追加するリソースが「常時起動か」「呼び出し時起動か」を区別する
- ログ・暗号化・ドメインの方針が既存と整合しているか

### 2. Construct で機能ごとに分ける

- Stack 直書きではなく、機能単位の Construct に切る
- 例: `BlogSiteConstruct`, `PopularPostsBucketConstruct`, `RankingApiConstruct`
- Construct 単位でユニットテスト（スナップショット / 構成検証）を書く

### 3. cdk-nag を必ず組み込む

```ts
import { Aspects } from 'aws-cdk-lib';
import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';
const app = new cdk.App();
const stack = new BlogSiteStack(app, 'BlogSiteStack');
Aspects.of(stack).add(new AwsSolutionsChecks({ verbose: true }));
```

- すべての Stack に NagPack を適用する
- 警告 / エラーは原則すべて解消する
- やむを得ず抑制する場合は、`NagSuppressions.addResourceSuppressions` に
  理由・影響・見直し条件を必ず書く

### 4. S3 + CloudFront

- S3 はサーバアクセスログ・暗号化・`blockPublicAccess` を既定で有効化
- CloudFront からのみ参照する Origin Access Control を使い、S3 を直接公開しない
- ログバケットを別バケットに切り、ライフサイクルを設定する
- レスポンスヘッダーポリシーで HSTS / X-Content-Type-Options 等を付与する

### 5. API Gateway + Lambda

- Lambda は ARM64（Graviton）を既定にする
- メモリ・タイムアウトは控えめに開始（必要に応じて引き上げ）
- API Gateway のステージはまず単一にする（環境ごとに Stack を分ける）
- 認証が必要な API は API Key / Cognito など要件に合うものを選び、ADR を残す

### 6. EventBridge / バッチ

- 定期処理は EventBridge Schedule から Lambda を起動する形を基本にする
- 失敗時のリトライ・DLQ を最初から考える
- ログ・通知はアラート対象を明確にしてから設定する

### 7. CloudWatch Logs

- すべてのロググループに保持期間（30〜90 日目安）を設定する
- ロググループ名 / リテンションをコードで明示する
- 構造化ログ前提でフィルタを後から増やせるようにする

### 8. IAM

- リソース単位で Role を作る
- `Resource: '*'` / `Action: '*'` を避ける
- 共有 Role / 全権限ロールを作らない
- 共通ヘルパで権限付与する場合も、結果を `cdk synth` で必ず確認する

### 9. MCP の活用

- `aws-cdk` MCP Server / `cdk-nag` MCP Integration が利用できる場合、
  - 設計案レビュー
  - 実装コードのチェック
  - cdk-nag 警告の補足説明
    に利用する
- ただし「MCP が OK と言ったから OK」にはしない
- CI 上の `cdk synth` と cdk-nag 検査結果が最終判断
- MCP の結果と CI が食い違う場合は CI を優先し、必要なら設計を見直す

### 10. CI 連携

- `npm run cdk synth` を CI で実行する
- cdk-nag 検査を CI のステップとして含める
- 失敗を「とりあえずスキップ」しない（理由を残して suppress）

## チェックリスト

CDK 変更 PR で確認する。

- [ ] 適切な Stack に置いているか（過剰な Stack 分割をしていないか）
- [ ] cdk-nag が全 Stack に適用されているか
- [ ] cdk-nag 警告がすべて解消 / 抑制理由付きか
- [ ] IAM がリソース単位・最小権限になっているか
- [ ] S3 の `blockPublicAccess` が有効か / Origin Access Control が使われているか
- [ ] ログ保持期間が明示されているか
- [ ] 環境差（`dev` / `prod`）が意識されているか
- [ ] 単体テスト（スナップショット / アサーション）が更新されているか
- [ ] MCP を使った場合、その結果に依存しすぎず CI の結果を尊重しているか
- [ ] AWS Budgets と整合した低コスト構成か

## 禁止事項

- cdk-nag を CI から除外する
- 抑制を理由なし追加する
- 共有の「全権限ロール」を作る
- VPC / NAT Gateway を必要性検討なしで作る
- `cdk synth` が失敗する状態でマージする
- 本番アカウントの認証情報をリポジトリ・CI ログに残す
- MCP の助言だけで合格判定する
