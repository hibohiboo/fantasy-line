---
last_updated: 2026-06-18
pbi: PBI-SaaS-002
---

# Cognito 認証基盤 CDK 実装設計

## 対象読者・目的・スコープ

**対象読者**: バックエンド開発者・インフラレビュアー

**目的**: Cognito User Pool を CDK で実装するにあたって検討した構成の選択肢・採用理由・セキュリティ上の判断を記録する。実装後も「なぜこの構成なのか」を読み解けるようにする。

**スコープ（含む）**:

- CDK 構成の採用理由と代替案比較
- cdk-nag の適用方針と suppression の根拠
- JWT Authorizer の適用範囲（どのエンドポイントを保護するか）
- テスト観点

**スコープ（含まない）**:

- Cognito 設計値（パスワードポリシー・custom attribute 等）→ [auth-cognito.md](../non-functional/auth-cognito.md)
- Lambda 側のテナント識別処理 → PBI-SaaS-004

---

## CDK 構成の選択

### 検討した選択肢

| 案 | 概要 | 評価 |
|---|---|---|
| A: 既存スタックに直接追記 | Cognito リソースを既存の単一スタックに追加する | 却下: スタックが既に大きく、さらに肥大化する。機能単位のテストがしにくい |
| **B: Cognito 専用 Construct を作成（採用）** | 機能単位の Construct として切り出し、既存スタックから呼び出す | 採用: プロジェクト規約「Construct で機能ごとに整理」に準拠。テスト対象が明確 |
| C: Cognito 専用 Stack を作成 | 独立した Stack として分離する | 却下: プロジェクト規約「最初から細かく Stack を分割しない」に反する。スタック間依存のコストが増す |

**採用: B 案。** 既存のスタック構造を崩さず Construct として機能を追加する。

---

## cdk-nag の適用方針

全スタックに `AwsSolutionsChecks` を適用する。警告・エラーがゼロ、または理由付き suppression で対処されていることを CI の合格条件とする。

### 想定される suppression と根拠

| ルール | 判断 | 根拠 |
|---|---|---|
| MFA 強制ルール | suppression | MFA は任意設定（OPTIONAL）とする設計（[auth-cognito.md §MFA](../non-functional/auth-cognito.md) 参照）。ユーザーが自分で TOTP/SMS を設定できる方針のため、Pool 全体での強制はしない |
| Advanced Security Mode ルール | suppression | 有料機能のためコスト制約（個人プロジェクト）により採用しない。不正アクセス事案が発生した場合または有料プランへ移行する場合に再評価する |

> 上記以外の警告が出た場合は、suppression する前にこのドキュメントの表に理由・影響・見直し条件を追記してから対処する。

---

## JWT Authorizer の適用範囲

API Gateway の各エンドポイントを以下の方針で保護する。

| エンドポイント | 保護 | 理由 |
|---|---|---|
| `/api/echo` | 不要 | 接続疎通テスト用。認証不要で到達確認できることが目的 |
| `/api/items` | 必要 | 認証済みユーザーのみアクセス可 |
| `/api/villages` | 必要 | 同上 |
| `/api/villages/{id}/residents` | 必要 | 同上 |
| `/api/residents` | 必要 | 同上 |

### X-Tenant-Id ヘッダーの検証責任

`auth-cognito.md §ユーザー種別` で定義している `servicer_admin` / `servicer_delegate` は `X-Tenant-Id` ヘッダーでテナントを指定する。このヘッダーの検証（値が空でないか、有効なテナント ID か）は **Lambda 側が担う**。

API Gateway レベルでの必須ヘッダー検証（`requestParameters`）は PBI-SaaS-004 以降の Lambda 実装フェーズで検討する。それまでの間、ヘッダーが省略された場合のリクエストは Lambda のバリデーション（Zod）が処理する。

---

## テスト観点

CDK のアサーションテストで以下の不変条件を固定する。スナップショットテストは意図しない変更の検出に用いる。

**Cognito User Pool:**

- パスワードポリシーが設計値（最小 8 文字・大小英数記号必須）と一致すること
- MFA が OPTIONAL に設定されていること
- custom attribute `custom:user_type`（String・最大長 32）が存在すること
- custom attribute `custom:tenant_id`（String・最大長 63）が存在すること

**App Client:**

- 認証フローが USER_SRP_AUTH であること
- アクセストークン・ID トークンの有効期限が 60 分であること
- リフレッシュトークンの有効期限が 30 日であること
- `custom:user_type` / `custom:tenant_id` が読み取りスコープに含まれること
- `custom:user_type` / `custom:tenant_id` が書き込みスコープに含まれないこと（ユーザー自身による変更防止）

**JWT Authorizer:**

- 保護対象エンドポイントに Cognito Authorizer が設定されていること

---

## 変更履歴

| PBI | 変更日 | 変更内容 |
|---|---|---|
| PBI-SaaS-002 | 2026-06-18 | 初版作成。CDK 構成選択・cdk-nag 方針・JWT Authorizer 適用範囲・テスト観点を記録 |
