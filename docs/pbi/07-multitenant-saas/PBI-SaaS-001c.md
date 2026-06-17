# PBI-SaaS-001c テナントプロビジョニング・ユーザー管理フロー設計

親エピック: [PBI-SaaS-001](PBI-SaaS-001.md) / 作成日: 2026-06-17

---

## ユーザーストーリー

As a `servicer_admin` / `tenant_admin`  
I want テナント発行フロー・`servicer_delegate` 作成フロー・テナント内ユーザー管理フロー（招待・削除・ロール割り当て）を設計ドキュメントとして確定したい  
So that 4 アクター（`servicer_admin` / `servicer_delegate` / `tenant_admin` / `tenant_user`）それぞれが・いつ・どの手順で操作するかが明確になり、実装 PBI をブレなく定義できる

---

## 背景 / 目的

テナント発行は `servicer_admin` が行い（テナントユーザーによる自己発行なし）、
`servicer_delegate` の作成も `servicer_admin` のみが行う。
テナント内のユーザー管理（招待・削除）は `tenant_admin` が SaaS アプリ内のユーザー管理画面から行う。
`tenant_admin` は同テナント内の `tenant_admin` / `tenant_user` を管理できるが、`servicer_*` ロールの付与はできない。

これらのフローを操作手順・画面遷移レベルで設計する。

---

## スコープ

### 含む

- テナントプロビジョニングフロー設計（`servicer_admin` 操作手順・実行手段の選定）
  - `service.tenants` への登録
  - `tenant_{slug}` Aurora スキーマ作成
  - `service.role_permissions` から `tenant_{slug}.role_permissions` へのシード
  - 初期 `tenant_admin` アカウント作成（Cognito + `tenant_{slug}.users`）
  - ロールバック手順
- `servicer_delegate` 作成フロー設計（`servicer_admin` が行う操作）
  - Cognito アカウント作成（`custom:user_type: "servicer_delegate"`）
  - `service.users` 登録 + `service.user_tenant_roles` でアクセス可能テナントを設定
- テナント内ユーザー管理フロー設計（`tenant_admin` が行う操作）
  - ユーザー招待（`tenant_user` / `tenant_admin`: Cognito AdminCreateUser + `tenant_{slug}.users` 登録）
  - ユーザー削除（Cognito + DB 両方）
  - ロール割り当て（`tenant_{slug}.user_roles` + `tenant_{slug}.role_permissions` 経由）
- ユーザー管理画面のワイヤーフレーム / 画面遷移図（PO 向け・開発者向け）
- 操作権限マトリクス（4 アクター: `servicer_admin` / `servicer_delegate` / `tenant_admin` / `tenant_user` それぞれが行える操作）

### 含まない

- Cognito User Pool の CDK 実装
- ユーザー管理画面の Vue コンポーネント実装
- テナントプロビジョニング Lambda の実装
- 課金・契約管理フロー

---

## ユースケース

### メイン（`servicer_admin` — テナント発行）

1. `servicer_admin` がテナントスラッグ・初期 `tenant_admin` メールアドレスを決定する
2. `servicer_admin` がプロビジョニング手順（管理 CLI / 管理コンソール / 管理 Lambda）を実行する
3. `service.tenants` に登録され、Aurora に `tenant_{slug}` スキーマが作成される
4. `service.role_permissions` の内容が `tenant_{slug}.role_permissions` にシードされる
5. Cognito に初期 `tenant_admin` アカウントが作成され（`custom:user_type: "tenant_admin"` / `custom:tenant_id: "{slug}"`）、招待メールが送信される
6. `tenant_{slug}.users` に初期管理者レコードが登録される
7. `tenant_admin` が招待メールから初回ログインし、パスワードを設定する

### メイン（`servicer_admin` — `servicer_delegate` 作成）

1. `servicer_admin` が `servicer_delegate` のメールアドレスとアクセス可能テナントを決定する
2. Cognito アカウントを作成（`custom:user_type: "servicer_delegate"`、`custom:tenant_id` は設定しない）
3. `service.users` に登録し、`service.user_tenant_roles` でアクセス可能テナントと役割を設定する

### メイン（`tenant_admin` — ユーザー管理）

1. `tenant_admin` がユーザー管理画面を開く
2. 管理者がメールアドレスとロール（`tenant_admin` / `tenant_user`）を入力してユーザーを招待する
3. 招待ユーザーが招待メールから初回ログインする
4. 管理者がユーザー一覧を確認し、必要に応じて `tenant_{slug}.user_roles` でロールを変更する
5. 管理者がユーザーを削除する（Cognito アカウント + `tenant_{slug}.users` 両方）

### 代替

- 招待メールが届かない場合、管理者が再送信できる

### 例外

- プロビジョニング中に Aurora スキーマ作成が失敗した場合 → `service.tenants` 登録をロールバックし、エラーを `servicer_admin` に通知する
- `tenant_admin` が自分自身を削除しようとした場合 → エラーメッセージを表示して拒否する（テナント内の最後の `tenant_admin` は削除不可）

---

## 受け入れ条件（Gherkin）

```gherkin
Scenario 1: テナントプロビジョニングフローの確定
  Given プロビジョニングフロー設計ドキュメントが存在する
  When フロー手順を確認したとき
  Then 実行主体（`servicer_admin`）と操作手段（管理 CLI / Lambda 等）が選定されていること
  And  `service.tenants` 登録 → Aurora スキーマ作成 → `role_permissions` シード → 初期 `tenant_admin` アカウント作成 の実行順序が定義されていること
  And  各ステップの失敗時ロールバック手順が定義されていること

Scenario 1b: `servicer_delegate` 作成フローの確定
  Given `servicer_delegate` 作成フロー設計ドキュメントが存在する
  When 作成手順を確認したとき
  Then 実行主体が `servicer_admin` のみであることが明記されていること
  And  Cognito アカウント作成（`custom:user_type: "servicer_delegate"`）→ `service.users` 登録 → `service.user_tenant_roles` 設定 の順序が定義されていること

Scenario 2: テナント内ユーザー招待フローの確定
  Given ユーザー管理フロー設計ドキュメントが存在する
  When ユーザー招待手順を確認したとき
  Then `tenant_admin` がメールアドレスとロール（`tenant_admin` / `tenant_user`）を入力して招待する手順が定義されていること
  And  Cognito AdminCreateUser を使った招待メール送信が採用されていること
  And  招待後の初回ログイン・パスワード設定フローが定義されていること
  And  `servicer_*` ロールを `tenant_admin` が付与できないことが明記されていること

Scenario 3: ユーザー削除フローの確定
  Given ユーザー管理フロー設計ドキュメントが存在する
  When ユーザー削除手順を確認したとき
  Then Cognito アカウントと DB レコード（`tenant_{slug}.users`）を両方削除する手順が定義されていること
  And  テナント内の最後の `tenant_admin` は削除できないルールが明記されていること

Scenario 4: 操作権限マトリクスの確定
  Given 権限マトリクス設計ドキュメントが存在する
  When マトリクスを確認したとき
  Then `servicer_admin` / `servicer_delegate` / `tenant_admin` / `tenant_user` それぞれが実行できる操作が一覧化されていること
  And  `tenant_admin` が自テナント外の操作を行えないことが明記されていること
  And  `tenant_admin` が追加できる管理者は同テナント内の `tenant_admin` のみであることが明記されていること

Scenario 5: ユーザー管理画面のフロー設計確定
  Given ユーザー管理画面の設計ドキュメントが存在する
  When 画面遷移・ワイヤーフレームを確認したとき
  Then ユーザー一覧・招待・削除・ロール変更の各操作に対応した画面フローが定義されていること
  And  PO 向けドキュメント（`docs/design/screen/`）と開発者向けドキュメント（`docs/design/detail/screen/`）の両方が作成されていること
```

---

## ルール（Example Mapping）

- **Rule 1: テナント発行はサービサーのみが行う**
  - Example: テナントユーザーがセルフサービスでテナントを作成する画面・API は提供しない

- **Rule 2: スラッグはサービサーがテナント追加時に決定し、後から変更しない**
  - Example: スラッグ変更はスキーマ名・グループ名・全 JWT 再発行を伴うため変更不可とし、フローに明記する

- **Rule 3: テナント内ユーザー管理は `tenant_admin` が SaaS アプリ内画面から行う**
  - Example: Cognito コンソールへのアクセス権限は `tenant_admin` に付与しない。操作は SaaS アプリ内のユーザー管理画面に限定する。`servicer_*` ロールの付与は `tenant_admin` からはできない

- **Rule 4: テナント内の最後の `tenant_admin` は削除できない**
  - Example: テナント内の `tenant_admin` ロールを持つユーザーが 1 人のとき、その削除操作は 400 エラーで拒否する

- **Rule 5: ユーザー削除は Cognito と DB の両方から物理削除する**
  - Example: 削除後、削除対象ユーザーの JWT は次のリクエストで 403 になる（Cognito 無効化を削除前に実行する）

---

## 不明点 / 質問

- プロビジョニング手順の実行手段: 管理 CLI スクリプト / 管理 Lambda（API 経由）/ AWS コンソール手動操作 のどれを採用するか？
- ユーザー招待メールはデフォルトの Cognito テンプレートを使うか、カスタマイズするか？

---

## INVEST チェック

- **Independent**: OK — Cognito 設計（SaaS-001a）・DB 設計（SaaS-001b）と並行して設計できる。実装は両方の完了後
- **Negotiable**: OK — プロビジョニング手段・招待メールのカスタマイズ有無は交渉余地あり
- **Valuable**: OK — フローが確定しないとユーザー管理画面・プロビジョニング Lambda の実装 PBI を定義できない
- **Estimable**: OK — 成果物が「フロー設計ドキュメント・ワイヤーフレーム・権限マトリクス」と明確
- **Small**: OK — 設計ドキュメント作成のみ（実装は含まない）
- **Testable**: OK — 各受け入れ条件がドキュメントの記載内容・フロー図の存在で検証可能
