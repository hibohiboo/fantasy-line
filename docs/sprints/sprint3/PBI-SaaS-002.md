# PBI-SaaS-002 作業計画 — Cognito User Pool CDK 実装

Sprint 3 / 作成日: 2026-06-18

**想定読者**: 実装 SubAgent・実装担当者  
**目的**: Phase 3 実装で必要なファイル配置・変更箇所・SubAgent 割り当てを記録する。  
**スコープ**: `infra/` 配下の CDK 実装のみ。Lambda 実装・フロントエンドは含まない。

設計の根拠は [cognito-cdk-design.md](../../design/infra/cognito-cdk-design.md) および [auth-cognito.md](../../design/non-functional/auth-cognito.md) を参照。

---

## 前提・依存関係

- `infra/` の TypeScript は `moduleResolution: NodeNext` のため、相対インポートは拡張子なし
- テストランナーは `jest`（`npm run test` で実行）
- `cdk-nag` は現在未インストール。`infra/` で `npm install cdk-nag --save-dev` が必要
- 既存の `infra/lib/infra-stack.ts` に手を加えるため、`cdk synth` が通ることを実装後に確認する

---

## ファイル配置

### 新規作成

| ファイル | 役割 |
|---|---|
| `infra/lib/auth/CognitoConstruct.ts` | Cognito User Pool + App Client の Construct |
| `infra/test/auth.test.ts` | アサーション + スナップショットテスト |

### 変更

| ファイル | 変更内容 |
|---|---|
| `infra/bin/infra.ts` | `cdk-nag` の `AwsSolutionsChecks` を `Aspects.of(app)` に追加 |
| `infra/lib/infra-stack.ts` | `CognitoConstruct` を呼び出し、`CognitoUserPoolsAuthorizer` を作成して各 method に付与 |
| `infra/package.json` | `cdk-nag` を `dependencies` に追加（`npm install cdk-nag`） |

---

## CognitoConstruct の実装詳細

### 公開プロパティ

```ts
readonly userPool: cognito.UserPool;
readonly userPoolClient: cognito.UserPoolClient;
```

### User Pool 設定値（auth-cognito.md に準拠）

| プロパティ | 値 |
|---|---|
| `selfSignUpEnabled` | `false` |
| `signInAliases` | `{ email: true }` |
| `passwordPolicy.minLength` | `8` |
| `passwordPolicy.requireUppercase` | `true` |
| `passwordPolicy.requireLowercase` | `true` |
| `passwordPolicy.requireDigits` | `true` |
| `passwordPolicy.requireSymbols` | `true` |
| `mfa` | `Mfa.OPTIONAL` |
| `mfaSecondFactor.otp` | `true` |
| `mfaSecondFactor.sms` | `true` |
| `customAttributes['user_type']` | `new StringAttribute({ maxLen: 32 })` |
| `customAttributes['tenant_id']` | `new StringAttribute({ maxLen: 63 })` |
| `userInvitation.emailSubject` | `'【Fantasy Line】アカウント登録のご案内'` |
| `userInvitation.emailBody` | 本文に `{username}` / `{####}` を含む日本語テキスト |

### App Client 設定値

| プロパティ | 値 |
|---|---|
| `authFlows.userSrp` | `true` |
| `accessTokenValidity` | `Duration.minutes(60)` |
| `idTokenValidity` | `Duration.minutes(60)` |
| `refreshTokenValidity` | `Duration.days(30)` |
| `readAttributes` | `custom:user_type`, `custom:tenant_id` を含む |
| `writeAttributes` | `custom:user_type`, `custom:tenant_id` を含まない |

### cdk-nag suppression（CognitoConstruct 内に記載）

```ts
NagSuppressions.addResourceSuppressions(userPool, [
  {
    id: 'AwsSolutions-COG2',
    reason:
      'MFA は OPTIONAL 設定（auth-cognito.md §MFA 参照）。' +
      'ユーザーが任意に TOTP/SMS を設定できる方針のため Pool 全体での強制はしない。',
    // 影響: 一部ユーザーが MFA なしでログイン可能
    // 見直し条件: MFA 強制要件がビジネス要件として定まった場合
  },
  {
    id: 'AwsSolutions-COG3',
    reason:
      'Advanced Security Mode は有料機能。個人プロジェクトのコスト制約により採用しない。',
    // 影響: 高度な異常ログイン検知が動作しない
    // 見直し条件: 有料プランへ移行する場合、または不正アクセス事案が発生した場合
  },
]);
```

---

## infra-stack.ts の変更詳細

### CognitoConstruct の呼び出し

```ts
const cognito = new CognitoConstruct(this, 'Cognito');
```

### Authorizer の作成

```ts
const authorizer = new apigateway.CognitoUserPoolsAuthorizer(
  this,
  'CognitoAuthorizer',
  { cognitoUserPools: [cognito.userPool] },
);
```

### 各 method への適用

`addMethod()` の第 3 引数に以下を渡す（echo は除外）。

```ts
{ authorizer, authorizationType: apigateway.AuthorizationType.COGNITO }
```

---

## bin/infra.ts の変更詳細

```ts
import { AwsSolutionsChecks } from 'cdk-nag';
import * as cdk from 'aws-cdk-lib/core';

// ...既存コード...
cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
```

---

## テスト設計（infra/test/auth.test.ts）

### テストフレームワーク

jest + `aws-cdk-lib/assertions` の `Template` クラスを使用。

### アサーション一覧

| テスト名 | 検証する CloudFormation プロパティ |
|---|---|
| User Pool が存在すること | リソースタイプ `AWS::Cognito::UserPool` が存在する |
| パスワードポリシーが設定されていること | `PasswordPolicy` が min 8・大小英数記号必須 |
| MFA が OPTIONAL であること | `MfaConfiguration: "OPTIONAL"` |
| custom:user_type が定義されていること | `Schema` に `Name: "user_type"`, `AttributeDataType: "String"`, `StringAttributeConstraints.MaxLength: "32"` |
| custom:tenant_id が定義されていること | `Schema` に `Name: "tenant_id"`, `AttributeDataType: "String"`, `StringAttributeConstraints.MaxLength: "63"` |
| App Client が USER_SRP_AUTH で設定されていること | `ExplicitAuthFlows` に `USER_SRP_AUTH` を含む |
| アクセストークンが 60 分であること | `TokenValidityUnits.AccessToken: "minutes"`, `AccessTokenValidity: 60` |
| ID トークンが 60 分であること | `TokenValidityUnits.IdToken: "minutes"`, `IdTokenValidity: 60` |
| リフレッシュトークンが 30 日であること | `TokenValidityUnits.RefreshToken: "days"`, `RefreshTokenValidity: 30` |
| custom:user_type が読み取りスコープに含まれること | `ReadAttributes` に `custom:user_type` を含む |
| custom:tenant_id が読み取りスコープに含まれること | `ReadAttributes` に `custom:tenant_id` を含む |
| custom:user_type が書き込みスコープに含まれないこと | `WriteAttributes` に `custom:user_type` を含まない |
| custom:tenant_id が書き込みスコープに含まれないこと | `WriteAttributes` に `custom:tenant_id` を含まない |

スナップショットテストは `infra/test/__snapshots__/auth.test.ts.snap` に自動生成する。

---

## SubAgent 割り当て

| サブタスク | SubAgent | 入力ドキュメント |
|---|---|---|
| cdk-nag インストール + `bin/infra.ts` 更新 | `aws-cdk-engineer` | 本ドキュメント §bin/infra.ts の変更 |
| `CognitoConstruct.ts` 新規作成 | `aws-cdk-engineer` | 本ドキュメント §CognitoConstruct |
| `infra-stack.ts` 更新（Authorizer 接続） | `aws-cdk-engineer` | 本ドキュメント §infra-stack.ts の変更 |
| `auth.test.ts` 新規作成 | `tdd-implementer` | 本ドキュメント §テスト設計 |
| suppression の妥当性・IAM 最小権限レビュー | `security-reviewer` | cognito-cdk-design.md |

---

## 完了条件

- [ ] `npm run synth`（`infra/` 内）がエラーなく通る
- [ ] cdk-nag の警告・エラーがゼロ、または理由付き suppression で対処済み
- [ ] `npm run test`（`infra/` 内）の全アサーションが通る
- [ ] `infra/test/__snapshots__/` にスナップショットが生成されている

---

## 発見事項・証跡（2026-06-18）

### cdk-nag v3 で NagSuppressions が削除されている

**発覚経緯**: Phase 3 実装で `aws-cdk-engineer` SubAgent を起動しようとした際、作業計画に `NagSuppressions.addResourceSuppressions` を使う指示を記載していた。ユーザーが [https://github.com/cdklabs/cdk-nag#migrating-from-v2](https://github.com/cdklabs/cdk-nag#migrating-from-v2) を参照し、v3 では `NagSuppressions` クラスが削除されていることを指摘。

**根本原因**: SubAgent のトレーニングデータに v2 の API が含まれており、v3 の破壊的変更を知らなかった。さらに `.claude/skills/aws-cdk-patterns/SKILL.md` のコード例にも `NagSuppressions` が残っていた。

**対処方針**: 毎回 WebFetch でドキュメントを取得するのはコストが高いため、スキルファイルを最新情報に合わせて修正する方針とした。不備を発見したタイミングでスキルを更新し、次回以降の SubAgent に正しい情報が渡るようにする。

### 修正したファイル

| ファイル | 変更内容 |
|---|---|
| `.claude/skills/aws-cdk-patterns/SKILL.md` | `NagSuppressions` の直接記載を削除し、「実装前に `aws-iac` MCP で現在の API を確認すること」を手順 1 と手順 3 に明記 |
| `.claude/agents/aws-cdk-engineer.md` | 「外部ライブラリの API は必ず MCP で確認する」セクションを追加。cdk-nag の v2→v3 破壊的変更を既知リストに記載 |

### cdk-nag v3 suppression の正しい書き方

作業計画の `§CognitoConstruct の実装詳細` に記載した suppression コードは **v2 の書き方** である可能性がある。
実装 SubAgent は `aws-iac` MCP サーバーで `cdk-nag suppression v3` を検索し、現在の正しい API を確認してから実装すること。

---

### aws-iac MCP サーバーが SubAgent から使えない問題（2026-06-18）

**事象**: SubAgent 実行時に「Server 'aws-iac' not found. Available servers: serena, ...」エラーが発生。`settings.json` に設定は存在するが、Claude Code の MCP サーバーとして登録されていない。

**調査結果**:
- `uvx awslabs.aws-iac-mcp-server@latest --help` はローカルで実行でき、パッケージ自体は起動する
- 起動時に `FastMCPDeprecationWarning` が 2 件発生（`fastmcp.server.proxy` の API が変わっている）
- このサーバーは "Remote to local bridge" アーキテクチャを採用しており、リモートエンドポイントへの接続を試みる
- 接続が完了する前にタイムアウトし、Claude Code への登録に失敗していると推測される

**誤った判断**: `settings.json` に設定がある＝動作している、と判断してしまった。実際には設定の存在と動作確認は別であり、`ListMcpResourcesTool` 等で事前確認すべきだった。

**方針**: MCP に頼らない回避策（WebFetch）ではなく、**aws-iac MCP サーバーを正しく動作させる**方向で解決する。

**調査結果（追記）**:
- `uvx awslabs.aws-iac-mcp-server@latest 2>/dev/null` の stdout は空 → 警告は stderr に出力されており、MCP stdio プロトコルへの混入はない
- `aws sts get-caller-identity` → `"Your session has expired. Please reauthenticate using 'aws login'"` → **AWS セッション期限切れが根本原因**
- `aws-iac` はリモート AWS エンドポイントへのプロキシのため、有効な認証情報が必要。セッション切れで接続フェーズが失敗し Claude Code への登録に至っていなかった

**解決手順**: `aws sso login`（または `aws login`）で AWS セッションを更新後、Claude Code を再起動する。

---

### cdk-nag v3 で `appConstruct` が提供されない問題（2026-06-18）

**事象**: `npm run synth` で以下のエラーが発生。

```
NagPack requires a construct tree on the validation context.
Use validateScope(scope) for direct invocation or ensure your CDK version provides appConstruct on IPolicyValidationContext.
```

**原因**: cdk-nag v3 は CDK の `IPolicyValidationContext` 上の `appConstruct` プロパティを使用するが、aws-cdk-lib 2.257.0（インストールされていた最小要件バージョン）ではこのプロパティが実装されていなかった。

**解決**: `aws-cdk-lib` を 2.260.0（最新）に更新することで解消。ユーザーが手動でアップデート実施。

---

### cdk-nag: echo エンドポイントの Cognito 認証なし警告（2026-06-18）

**事象**: aws-cdk-lib 更新後の `npm run synth` で以下の cdk-nag 違反が発生。

```
The API GW method does not use a Cognito user pool authorizer.
API Gateway validates the tokens from a successful user pool authentication,
and uses them to grant your users access to resources including Lambda functions,
or your own API.
```

**原因**: `/api/echo` エンドポイントは設計上「疎通テスト用のため認証不要」（cognito-cdk-design.md §JWT Authorizer の適用範囲）としているが、cdk-nag がすべての API Gateway メソッドに Cognito 認証を要求するルールを適用したため。

**対処方針**: echo エンドポイントの該当メソッドに suppression を追加し、理由・影響・見直し条件を明記する。suppress する rule ID は `cdk.out/policy-validation-report.json` で確認する。
