---
last_updated: 2026-06-17
---

# Cognito 設計ドキュメント（マルチテナント SaaS）

## 対象読者・目的・スコープ

**対象読者**: バックエンド開発者・インフラ担当者（CDK 実装者含む）

**目的**: 全テナント共用 Cognito User Pool の構成・JWT claim 定義・App Client 設定を確定し、テナント識別と基本ロール判定を JWT だけで完結させる実装の根拠を整える。

**スコープ（含む）**:

- Cognito User Pool 構成設計（パスワードポリシー・MFA・招待メール設定方針）
- custom attribute 定義（型・最大長・必須有無・IAM 読み書き可否）
- Cognito グループの利用方針（利用しない判断根拠を含む）
- App Client 設計（認証フロー・トークン有効期限・スコープ）
- JWT claim 対応表（アクター種別ごとのクレーム差異を含む）
- テナントスラッグの文字種・長さ制約

**スコープ（含まない）**:

- User Pool / App Client の CDK 実装（別タスク）
- 詳細な機能認可設計（PBI-SaaS-001b・PBI-SaaS-001d）
- ユーザー管理フロー（PBI-SaaS-001c）
- フロントエンドのログイン UI 実装

---

## アクター定義

PBI-SaaS-001 で確定したアクターを以下の通り定義する。

| 識別子 | 名称 | 所属 | テナントアクセス |
|---|---|---|---|
| `servicer_admin` | サービサーのシステム管理者 | サービサー側 | 複数（全テナントまたは指定テナント群）。テナント切り替えあり |
| `servicer_delegate` | サービサーの管理移譲アルバイター | サービサー側 | 複数（割り当てテナント群）。テナント切り替えあり |
| `tenant_admin` | テナントシステム管理者 | テナント側 | 特定の 1 テナントのみ（固定） |
| `tenant_user` | テナント一般利用者 | テナント側 | 特定の 1 テナントのみ（固定） |

---

## Cognito User Pool 構成方針

### 基本方針: 全テナント共用 1 Pool

全テナントを 1 つの Cognito User Pool に収容する。テナントごとに User Pool を分けると、テナント追加のたびにインフラ変更が必要になりコストが増大するため採用しない。テナントの識別は custom attribute（`custom:user_type` / `custom:tenant_id`）で行う。

### パスワードポリシー

| 項目 | 設定値 |
|---|---|
| 最小文字長 | 8 文字 |
| 大文字 | 1 文字以上必須 |
| 小文字 | 1 文字以上必須 |
| 数字 | 1 文字以上必須 |
| 記号 | 1 文字以上必須 |

### MFA

任意設定とする。テナントごとに MFA 強制レベルを変更する機能は提供しない（Pool 単位の設定に統一）。ユーザー自身が TOTP または SMS による MFA を任意で設定できる。

### 招待メール

- 言語: 日本語でカスタマイズする
- 件名例: `【サービス名】アカウント登録のご案内`
- 本文にはログイン URL・初期パスワードを含める
- テナント名の差し込みは今後の検討事項とし、初版は含めない

### ユーザー削除

物理削除とする。Cognito ユーザーと DB レコードの両方を削除する。論理削除は持たない。

---

## custom attribute 定義

| attribute | 型 | 最大長 | 必須 | 対象 | 説明 |
|---|---|---|---|---|---|
| `custom:user_type` | String | 32 | 必須 | 全ユーザー | `"servicer_admin"` \| `"servicer_delegate"` \| `"tenant_admin"` \| `"tenant_user"` の 4 値 |
| `custom:tenant_id` | String | 63 | `tenant_*` のみ必須 | `tenant_*` ユーザーのみ | テナントスラッグ。`servicer_*` は設定しない |

### IAM 読み書き可否

- `custom:user_type`:
  - **書き込み**: 管理者（Admin API 経由）のみ可。ユーザー自身による変更は不可。
  - **読み取り**: App Client に read スコープを付与し、ID トークンに含める。
- `custom:tenant_id`:
  - **書き込み**: 管理者（Admin API 経由）のみ可。ユーザー自身による変更は不可。
  - **読み取り**: App Client に read スコープを付与し、ID トークンに含める。

### servicer_* ユーザーの扱い

`servicer_admin` および `servicer_delegate` の JWT には `custom:tenant_id` が存在しない。これらのユーザーが特定のテナントにアクセスする際は、リクエストヘッダー `X-Tenant-Id` でテナントスラッグを指定する。

---

## テナントスラッグ命名規則

テナントスラッグは MySQL スキーマ名（`tenant_{slug}`）に直接使用されるため、制約を厳しく設ける。

| 項目 | 仕様 |
|---|---|
| 使用可能文字 | 英小文字（a-z）・数字（0-9）・ハイフン（-） |
| 先頭・末尾 | ハイフン禁止 |
| 最小長 | 2 文字 |
| 最大長 | 32 文字 |
| スキーマ名 | `tenant_` + スラッグ = 最大 39 文字（MySQL の 64 文字制限内） |

### 一意性保証

- `service.tenants.slug` カラムに UNIQUE 制約を設ける
- アプリケーション層でも重複確認を行い、409 Conflict を返す

### 変更不可

スラッグは発行後に変更できない。スラッグを変更する場合、MySQL スキーマ名の変更・既存 JWT の再発行が必要になるため、設計上の変更不可制約とする。

---

## Cognito グループの利用方針

**テナント識別に Cognito グループは使わない。**

custom attribute（`custom:user_type` / `custom:tenant_id`）で一元管理する。

### グループを使わない判断根拠

- テナント数が増えるとグループ数が爆発し、管理コストが増大する
- テナント識別を custom attribute に統一することで、グループと属性を突き合わせる実装が不要になる
- custom attribute を ID トークンに含めれば、Lambda オーソライザーや API ハンドラーが追加の Cognito API 呼び出しなしに識別できる

### 将来的なグループ利用

将来的に細粒度のロール管理（テナント内の部署別権限など）が必要になった場合は ADR を作成してから採用する。

---

## App Client 設計

| 項目 | 設定値 | 理由 |
|---|---|---|
| 認証フロー | `USER_SRP_AUTH` | SRP（Secure Remote Password）でパスワードをネットワーク上に露出しない |
| 管理系操作 | Admin API（`AdminInitiateAuth` 等）を使用 | サーバーサイドのみで実行する操作に限定 |
| アクセストークン有効期限 | 1 時間 | セキュリティと利便性のバランス |
| ID トークン有効期限 | 1 時間 | アクセストークンと揃える |
| リフレッシュトークン有効期限 | 30 日 | ユーザーの再ログイン頻度を抑える |

### custom attribute の読み取りスコープ

App Client の読み取り属性（Read attributes）に以下を追加し、ID トークンに含める。

- `custom:user_type`
- `custom:tenant_id`

書き込み属性（Write attributes）には追加しない（ユーザー自身による変更を防止）。

---

## JWT claim 対応表

| claim | 説明 | `servicer_admin` | `servicer_delegate` | `tenant_admin` | `tenant_user` |
|---|---|---|---|---|---|
| `sub` | Cognito ユーザー ID | ✓ | ✓ | ✓ | ✓ |
| `email` | メールアドレス | ✓ | ✓ | ✓ | ✓ |
| `custom:user_type` | アクター種別 | `"servicer_admin"` | `"servicer_delegate"` | `"tenant_admin"` | `"tenant_user"` |
| `custom:tenant_id` | テナントスラッグ | なし | なし | `"{slug}"` | `"{slug}"` |

### テナント識別方式の違い

- `tenant_admin` / `tenant_user`: JWT の `custom:tenant_id` からテナントスラッグを取得し、`tenant_{slug}` スキーマに接続する。
- `servicer_admin` / `servicer_delegate`: JWT に `custom:tenant_id` を持たない。リクエストヘッダー `X-Tenant-Id` でテナントスラッグを指定する。リクエストボディからテナント ID を受け取ってはならない。

---

## 例外・エラー方針

| 条件 | レスポンス |
|---|---|
| `tenant_*` ユーザーの JWT に `custom:tenant_id` が存在しない | 403 Forbidden |
| `custom:user_type` が想定 4 値（`servicer_admin` / `servicer_delegate` / `tenant_admin` / `tenant_user`）以外 | 403 Forbidden |

エラーレスポンスにはスタックトレース・内部 ID・Cognito のエラー詳細を含めない。

---

## 変更履歴

| PBI | 変更日 | 変更内容 |
|---|---|---|
| PBI-SaaS-001a | 2026-06-17 | 初版作成。Cognito User Pool 設計・JWT claim 定義・App Client 設定・テナントスラッグ制約を定義 |
