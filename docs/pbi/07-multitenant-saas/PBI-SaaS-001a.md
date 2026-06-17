# PBI-SaaS-001a Cognito 設計（claim 定義・グループ構成）

親エピック: [PBI-SaaS-001](PBI-SaaS-001.md) / 作成日: 2026-06-17

---

## ユーザーストーリー

As a サービサー  
I want Cognito User Pool の構成・JWT claim 定義・グループ命名規則を設計ドキュメントとして確定したい  
So that テナント識別と基本ロール判定を JWT だけで完結させる実装の根拠が整う

---

## 背景 / 目的

全テナント共用の単一 Cognito User Pool を使い、コストを抑えながらテナントを識別する。
JWT の custom claim にテナントスラッグ（`custom:tenant_id`）と基本ロール（`custom:tenant_role`）を埋め込み、
詳細な機能認可は DB テーブル（PBI-SaaS-001b）に委ねる構成を設計する。

---

## スコープ

### 含む

- Cognito User Pool 構成設計（パスワードポリシー・MFA・招待メール設定方針）
- custom attribute 定義（`custom:tenant_id`・`custom:tenant_role` の型・最大長・必須有無）
- Cognito グループ命名規則（テナントスラッグを含む命名パターン）
- App Client 設計（認証フロー・トークン有効期限・scope）
- JWT claim 一覧（標準 claim + custom claim の対応表）
- テナントスラッグの文字種・長さ制約の定義

### 含まない

- User Pool / App Client の CDK 実装
- 詳細な機能認可設計（→ PBI-SaaS-001b・PBI-SaaS-001d）
- ユーザー管理フロー（→ PBI-SaaS-001c）
- フロントエンドのログイン UI 実装

---

## ユースケース

### メイン

1. サービサーがテナントを発行する際、Cognito グループを作成しスラッグを `custom:tenant_id` に設定する
2. テナントシステム管理者がログインし、JWT に `custom:tenant_id` と `custom:tenant_role: "admin"` が含まれる
3. 一般ユーザーがログインし、JWT に `custom:tenant_id` と `custom:tenant_role: "user"` が含まれる
4. API が JWT の `custom:tenant_id` を読み取り、テナントスキーマに接続する

### 例外

- `custom:tenant_id` が JWT に存在しない → 403 Forbidden
- `custom:tenant_role` が想定値以外 → 403 Forbidden

---

## 受け入れ条件（Gherkin）

```gherkin
Scenario 1: custom attribute 定義の確定
  Given Cognito User Pool 設計ドキュメントが存在する
  When custom attribute 一覧を確認したとき
  Then `custom:tenant_id` が文字列型・最大長明記・必須として定義されていること
  And  `custom:tenant_role` が文字列型（"admin" | "user"）として定義されていること
  And  各 attribute の IAM での読み書き可否が明記されていること

Scenario 2: テナントスラッグ制約の確定
  Given テナントスラッグ命名規則ドキュメントが存在する
  When スラッグのバリデーション仕様を確認したとき
  Then 使用可能文字（英小文字・数字・ハイフン等）が定義されていること
  And  最小長・最大長が定義されていること
  And  スラッグの一意性保証方法（サービサー管理台帳での重複チェック等）が定義されていること

Scenario 3: Cognito グループ命名規則の確定
  Given グループ命名規則ドキュメントが存在する
  When テナント `acme` のグループ一覧を確認したとき
  Then 管理者グループと一般ユーザーグループの命名パターンが定義されていること
  And  グループと `custom:tenant_role` claim の対応関係が明記されていること

Scenario 4: App Client 設計の確定
  Given App Client 設計ドキュメントが存在する
  When App Client の設定項目を確認したとき
  Then 認証フロー（USER_PASSWORD_AUTH / USER_SRP_AUTH 等）が選定されていること
  And  アクセストークン・IDトークン・リフレッシュトークンの有効期限が定義されていること
  And  custom attribute の読み取りスコープが設定されていること

Scenario 5: JWT claim 対応表の確定
  Given JWT claim 設計ドキュメントが存在する
  When claim 一覧を確認したとき
  Then `sub`（Cognito ユーザー ID）・`cognito:groups`・`custom:tenant_id`・`custom:tenant_role` の役割と取得方法が対応表にまとめられていること
```

---

## ルール（Example Mapping）

- **Rule 1: テナント識別は `custom:tenant_id`（スラッグ）のみで行う**
  - Example: `custom:tenant_id = "acme"` → スキーマ `tenant_acme` に接続する。リクエストボディからテナント ID を受け取ってはならない

- **Rule 2: `custom:tenant_role` は Cognito レベルの基本ロールのみを表す**
  - Example: `"admin"` → テナント内ユーザー管理が可能。詳細な機能認可（どの画面・操作が可能か）は DB テーブルで判断する

- **Rule 3: User Pool は全テナント共用 1 Pool**
  - Example: テナント `acme` と `beta` は同一 User Pool に共存する。グループ命名でテナントを区別する

- **Rule 4: スラッグはサービサーが発行時に決定し、後から変更できない**
  - Example: スラッグ変更はスキーマ名変更・グループ名変更を伴うため、変更不可とし設計ドキュメントに明記する

---

## 不明点 / 質問

- MFA は任意か必須か（テナントごとに設定可能にするか）？
- 招待メールのカスタマイズ（テナント名差し込み等）はこの PBI のスコープに含めるか？

---

## INVEST チェック

- **Independent**: OK — Cognito 設計のみに閉じており、DB・API 設計と並行して進められる
- **Negotiable**: OK — グループ命名規則・App Client 設定の詳細は交渉余地あり
- **Valuable**: OK — JWT claim 定義が確定しないと後続の API 認可設計（SaaS-001d）が進まない
- **Estimable**: OK — 成果物が「設計ドキュメント 1 件（claim 定義・グループ規則・App Client）」と明確
- **Small**: OK — Cognito 設計ドキュメントの作成のみ
- **Testable**: OK — 各受け入れ条件がドキュメントの記載内容で検証可能
