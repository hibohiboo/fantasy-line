# PBI-SaaS-002 Cognito User Pool CDK 実装

親エピック: [PBI-SaaS-001](PBI-SaaS-001.md) / 作成日: 2026-06-17

---

## ユーザーストーリー

As a インフラ担当開発者  
I want Cognito User Pool・App Client・JWT Authorizer を CDK で実装したい  
So that マルチテナント SaaS の認証基盤が AWS 上に構築され、後続の Lambda 実装で JWT 認証を利用できる

---

## 背景 / 目的

[auth-cognito.md](../../design/non-functional/auth-cognito.md) で確定した設計を AWS CDK (TypeScript) で実装する。
全テナント共用の単一 Cognito User Pool と App Client を作成し、
API Gateway に Cognito JWT Authorizer を接続することで、Lambda は JWT の claims だけで認証済みリクエストを処理できる。

---

## スコープ

### 含む

- Cognito User Pool CDK 実装
  - パスワードポリシー（最小 8 文字・大文字小文字数字記号要件）
  - MFA 任意設定（OPTIONAL）
  - custom attribute 定義（`custom:user_type`・`custom:tenant_id`）
  - 招待メール 日本語カスタマイズ（初回ログイン案内）
- App Client CDK 実装
  - 認証フロー: `USER_SRP_AUTH`
  - アクセストークン / ID トークン有効期限: 1 時間
  - リフレッシュトークン有効期限: 30 日
  - `custom:user_type`・`custom:tenant_id` の read スコープ設定
- Cognito JWT Authorizer を API Gateway に接続する CDK 実装
- cdk-nag 対応（抑制が必要な場合は理由・影響・見直し条件を必ず記載）
- CDK スナップショット / アサーションテスト（`infra/cdk/test/`）

### 含まない

- Cognito ユーザーの作成・管理（→ PBI-SaaS-005）
- フロントエンドのログイン UI
- Lambda 内の `tenantContext` ミドルウェア（→ PBI-SaaS-004）

---

## ユースケース

### メイン

1. CDK デプロイ後、Cognito User Pool と App Client が AWS 上に存在する
2. API Gateway の全認証済みエンドポイントに Cognito JWT Authorizer が設定され、未認証リクエストは 401 で拒否される
3. 認証済みリクエストの Lambda コンテキストに JWT claims（`custom:user_type`・`custom:tenant_id` 等）が渡される

### 例外

- cdk-nag が警告を出した場合 → 理由・影響・見直し条件を suppression コメントに記載して対応

---

## 受け入れ条件（Gherkin）

```gherkin
Scenario 1: Cognito User Pool が正しく定義されていること
  Given CDK スタックが存在する
  When `cdk synth` を実行したとき
  Then CloudFormation テンプレートに Cognito UserPool リソースが含まれること
  And  custom attribute `custom:user_type`（String・最大長 32）が定義されていること
  And  custom attribute `custom:tenant_id`（String・最大長 63）が定義されていること
  And  パスワードポリシーが最小 8 文字・大文字・小文字・数字・記号を要求するよう設定されていること
  And  MFA が OPTIONAL に設定されていること

Scenario 2: App Client が正しく定義されていること
  Given CDK スタックが存在する
  When `cdk synth` を実行したとき
  Then App Client が USER_SRP_AUTH で設定されていること
  And  アクセストークンと ID トークンの有効期限が 60 分に設定されていること
  And  リフレッシュトークンの有効期限が 30 日に設定されていること
  And  `custom:user_type`・`custom:tenant_id` が読み取りスコープに含まれていること

Scenario 3: Cognito JWT Authorizer が API Gateway に接続されていること
  Given CDK スタックが存在する
  When `cdk synth` を実行したとき
  Then API Gateway の全認証済みエンドポイントに Cognito JWT Authorizer が設定されていること

Scenario 4: cdk-nag が通ること
  Given CDK スタックが存在する
  When `cdk synth` を実行したとき
  Then cdk-nag の警告・エラーがゼロ、または理由付き suppression で対処されていること

Scenario 5: CDK テストが通ること
  Given `infra/cdk/test/` にテストが存在する
  When `npm run test` を実行したとき
  Then Cognito 関連のスナップショット / アサーションテストが全てパスすること
```

---

## ルール（Example Mapping）

- **Rule 1: custom attribute の書き込みは管理者のみ許可する**
  - Example: `custom:user_type` / `custom:tenant_id` は App Client の `writeAttributes` に含めない（ユーザー自身が変更できない設定にする）

- **Rule 2: cdk-nag の抑制には理由・影響・見直し条件を必ず記載する**
  - Example: 抑制なしで全警告をパスすることが目標。抑制が必要な場合は `NagSuppressions.addResourceSuppressions` に理由コメントを記載する

- **Rule 3: 招待メールは日本語で記述する**
  - Example: Cognito の `inviteMessageTemplate` を設定し、日本語の本文・件名を記述する。テナント名の差し込みは今後の検討対象

---

## 不明点 / 質問

- 招待メール本文のテンプレート文言（日本語化は今回スコープ。テナント名差し込みは後続 PBI）

---

## INVEST チェック

- **Independent**: OK — 設計（PBI-SaaS-001a）完了済み。PBI-SaaS-003 と並行可能
- **Negotiable**: OK — App Client の認証フロー・トークン有効期限は交渉余地あり
- **Valuable**: OK — Cognito 基盤なしでは JWT 認証が動かない
- **Estimable**: OK — CDK での Cognito 実装は実績あり
- **Small**: OK — CDK Construct の追加のみ（Lambda 実装を含まない）
- **Testable**: OK — `cdk synth` + cdk-nag + スナップショットテストで検証可能
