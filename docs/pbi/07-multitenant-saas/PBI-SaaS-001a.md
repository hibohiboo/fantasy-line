# PBI-SaaS-001a Cognito 設計（claim 定義・グループ構成）

親エピック: [PBI-SaaS-001](PBI-SaaS-001.md) / 作成日: 2026-06-17

---

## ユーザーストーリー

As a サービサー  
I want Cognito User Pool の構成・JWT claim 定義・グループ命名規則を設計ドキュメントとして確定したい  
So that テナント識別と基本ロール判定を JWT だけで完結させる実装の根拠が整う

---

## 背景 / 目的

全テナント共用の単一 Cognito User Pool を使い、コストを抑えながらアクター種別とテナントを識別する。

JWT の custom claim にアクター種別（`custom:user_type`）を全ユーザー共通で付与し、
テナント側ユーザー（`tenant_admin` / `tenant_user`）にはさらに所属テナントのスラッグ（`custom:tenant_id`）を付与する。
サービサー側ユーザー（`servicer_admin` / `servicer_delegate`）は複数テナントにアクセスするため
JWT にテナントを埋め込まず、リクエストヘッダー `X-Tenant-Id` でテナントを指定する。
詳細な機能認可は DB テーブル（PBI-SaaS-001b）に委ねる構成を設計する。

---

## スコープ

### 含む

- Cognito User Pool 構成設計（パスワードポリシー・MFA・招待メール設定方針）
- custom attribute 定義（`custom:user_type`・`custom:tenant_id` の型・最大長・必須有無）
  - `custom:user_type`: 全ユーザー必須（`"servicer_admin"` \| `"servicer_delegate"` \| `"tenant_admin"` \| `"tenant_user"`）
  - `custom:tenant_id`: `tenant_*` ユーザーのみ必須（`servicer_*` は設定しない）
- Cognito グループの利用方針（テナント識別は custom attribute で行うため、グループの役割・利用有無を明記）
- App Client 設計（認証フロー・トークン有効期限・scope）
- JWT claim 一覧（標準 claim + custom claim の対応表。アクター種別ごとのクレーム差異を含む）
- テナントスラッグの文字種・長さ制約の定義

### 含まない

- User Pool / App Client の CDK 実装
- 詳細な機能認可設計（→ PBI-SaaS-001b・PBI-SaaS-001d）
- ユーザー管理フロー（→ PBI-SaaS-001c）
- フロントエンドのログイン UI 実装

---

## ユースケース

### メイン

1. `servicer_admin` がテナントを発行する際、初期 `tenant_admin` の Cognito アカウントを作成し、`custom:user_type: "tenant_admin"` と `custom:tenant_id: "{slug}"` を設定する
2. `tenant_admin` がログインし、JWT に `custom:user_type: "tenant_admin"` と `custom:tenant_id: "{slug}"` が含まれる
3. `tenant_user` がログインし、JWT に `custom:user_type: "tenant_user"` と `custom:tenant_id: "{slug}"` が含まれる
4. `servicer_admin` がログインし、JWT に `custom:user_type: "servicer_admin"` が含まれる（`custom:tenant_id` なし）
5. `servicer_delegate` がログインし、JWT に `custom:user_type: "servicer_delegate"` が含まれる（`custom:tenant_id` なし）
6. API が JWT の `custom:user_type` でアクター種別を判定する。`tenant_*` は `custom:tenant_id` からテナントスキーマを特定し、`servicer_*` は `X-Tenant-Id` ヘッダーで特定する

### 例外

- `tenant_*` ユーザーの JWT に `custom:tenant_id` が存在しない → 403 Forbidden（`servicer_*` には適用しない）
- `custom:user_type` が想定 4 値以外 → 403 Forbidden

---

## 受け入れ条件（Gherkin）

```gherkin
Scenario 1: custom attribute 定義の確定
  Given Cognito User Pool 設計ドキュメントが存在する
  When custom attribute 一覧を確認したとき
  Then `custom:user_type` が文字列型（"servicer_admin" | "servicer_delegate" | "tenant_admin" | "tenant_user"）として定義されていること
  And  `custom:tenant_id` が文字列型・最大長明記・tenant_* ユーザーのみ必須として定義されていること
  And  `servicer_*` ユーザーには `custom:tenant_id` を設定しないことが明記されていること
  And  各 attribute の IAM での読み書き可否が明記されていること

Scenario 2: テナントスラッグ制約の確定
  Given テナントスラッグ命名規則ドキュメントが存在する
  When スラッグのバリデーション仕様を確認したとき
  Then 使用可能文字（英小文字・数字・ハイフン等）が定義されていること
  And  最小長・最大長が定義されていること
  And  スラッグの一意性保証方法（`service.tenants` テーブルでの重複チェック等）が定義されていること

Scenario 3: Cognito グループの利用方針確定
  Given グループ利用方針ドキュメントが存在する
  When Cognito グループの利用方針を確認したとき
  Then テナント識別は custom attribute（`custom:user_type` / `custom:tenant_id`）で行い、グループはテナント識別に使わないことが明記されていること
  And  グループを利用する場合・しない場合の判断根拠が記載されていること

Scenario 4: App Client 設計の確定
  Given App Client 設計ドキュメントが存在する
  When App Client の設定項目を確認したとき
  Then 認証フロー（USER_PASSWORD_AUTH / USER_SRP_AUTH 等）が選定されていること
  And  アクセストークン・IDトークン・リフレッシュトークンの有効期限が定義されていること
  And  custom attribute の読み取りスコープが設定されていること

Scenario 5: JWT claim 対応表の確定
  Given JWT claim 設計ドキュメントが存在する
  When claim 一覧を確認したとき
  Then `sub`（Cognito ユーザー ID）・`custom:user_type`・`custom:tenant_id` の役割・対象アクター・取得方法が対応表にまとめられていること
  And  `servicer_*` は `custom:tenant_id` を持たず `X-Tenant-Id` ヘッダーを使うことが明記されていること
```

---

## ルール（Example Mapping）

- **Rule 1: テナント識別方式はアクター種別によって異なる**
  - Example: `tenant_*` → JWT の `custom:tenant_id = "acme"` → スキーマ `tenant_acme` に接続。`servicer_*` → リクエストヘッダー `X-Tenant-Id: acme` から特定。リクエストボディからテナント ID を受け取ってはならない

- **Rule 2: `custom:user_type` はアクター種別を表す 4 値のクレームである**
  - Example: `"tenant_admin"` → テナント内ユーザー管理が可能。詳細な機能認可（どの画面・操作が可能か）は DB テーブルで判断する

- **Rule 3: User Pool は全テナント共用 1 Pool**
  - Example: テナント `acme` と `beta` は同一 User Pool に共存する。アクター種別の区別は `custom:user_type` で行い、Cognito グループはテナント識別には使わない

- **Rule 4: スラッグはサービサーが発行時に決定し、後から変更できない**
  - Example: スラッグ変更はスキーマ名変更・JWT 再発行を伴うため、変更不可とし設計ドキュメントに明記する

---

## 不明点 / 質問

- MFA は任意か必須か（テナントごとに設定可能にするか）？ → 任意
- 招待メールのカスタマイズ（テナント名差し込み等）はこの PBI のスコープに含めるか？ → 含める。日本語で送付。

---

## INVEST チェック

- **Independent**: OK — Cognito 設計のみに閉じており、DB・API 設計と並行して進められる
- **Negotiable**: OK — グループ命名規則・App Client 設定の詳細は交渉余地あり
- **Valuable**: OK — JWT claim 定義が確定しないと後続の API 認可設計（SaaS-001d）が進まない
- **Estimable**: OK — 成果物が「設計ドキュメント 1 件（claim 定義・グループ規則・App Client）」と明確
- **Small**: OK — Cognito 設計ドキュメントの作成のみ
- **Testable**: OK — 各受け入れ条件がドキュメントの記載内容で検証可能
