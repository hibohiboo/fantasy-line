# PBI-SaaS-001d API 認可パターン設計 + 既存ドキュメント横断更新

親エピック: [PBI-SaaS-001](PBI-SaaS-001.md) / 作成日: 2026-06-17

---

## ユーザーストーリー

As a 開発者  
I want API レイヤーでのテナントコンテキスト取得・スキーマ接続切替・DB ベース認可チェックの代表パターンを確定し、既存設計ドキュメントを横断更新したい  
So that 全 API ハンドラーが同じパターンに従ってテナント境界を守る実装ができる

---

## 背景 / 目的

SaaS-001a（Cognito）・SaaS-001b（DB）・SaaS-001c（フロー）の設計が揃った後、
API レイヤーでこれらをどう組み合わせるかを「代表パターン」として設計する。
またこれまでの単一ユーザー前提で書かれた既存設計ドキュメントをマルチテナント対応に更新する。

---

## スコープ

### 含む

- テナントコンテキスト取得パターン（JWT `custom:tenant_id` の取得元と取得タイミング）
- テナントスキーマへの接続切替パターン（`getOwnerId` に相当する `getTenantContext` 関数の設計）
- DB ベース認可チェックパターン（`permissions` テーブルを参照した機能認可のフロー）
- クロステナントアクセス拒否パターン（誤って他テナントのリソースにアクセスしようとした場合の 403）
- 既存設計ドキュメントの横断更新:
  - `docs/design/non-functional/security.md` — 認証・認可テーブルにテナント対応を追記
  - `docs/design/non-functional/api-architecture.md` — 代表パターンにテナントコンテキスト取得フローを追加
  - `docs/design/non-functional/infrastructure.md` — CDK スタック構成にマルチテナント対応の変更点を追記

### 含まない

- `getTenantContext` 関数の実装
- DB 認可チェックミドルウェアの実装
- Cognito Authorizer の CDK 実装

---

## ユースケース

### メイン

1. API リクエストが来たとき、API Gateway Authorizer が JWT を検証し、`custom:tenant_id` をコンテキストに含めて Lambda に渡す
2. Lambda ハンドラーが `getTenantContext(event)` を呼び出し、テナントスラッグとユーザー ID を取得する
3. テナントスラッグから Drizzle ORM の接続をテナントスキーマに切り替える
4. 機能認可が必要な操作では、`user_roles`・`role_permissions`・`permissions` テーブルを参照して許可/拒否を判定する
5. 認可 OK の場合のみビジネスロジックを実行し、レスポンスを返す

### 例外

- JWT に `custom:tenant_id` がない → 403 Forbidden（テナント未割り当て）
- テナントスキーマが存在しない → 503 Service Unavailable（プロビジョニング未完了）
- 認可チェックで権限なし → 403 Forbidden（権限不足）

---

## 受け入れ条件（Gherkin）

```gherkin
Scenario 1: テナントコンテキスト取得パターンの確定
  Given API 認可パターン設計ドキュメントが存在する
  When テナントコンテキスト取得パターンを確認したとき
  Then JWT `custom:tenant_id` の取得元（API Gateway Authorizer context）が定義されていること
  And  `getTenantContext(event)` 相当の関数シグネチャと戻り値型が設計されていること
  And  `custom:tenant_id` が存在しない場合に 403 を早期リターンするパターンが示されていること

Scenario 2: DB ベース認可チェックパターンの確定
  Given API 認可パターン設計ドキュメントが存在する
  When DB 認可チェックパターンを確認したとき
  Then `resource`（対象リソース）と `action`（操作種別）の組み合わせで権限を判定するパターンが定義されていること
  And  Cognito `custom:tenant_role` と DB の `user_roles` の参照順序・使い分けが明記されていること
  And  認可失敗時に 403 を返すパターンが示されていること

Scenario 3: クロステナントアクセス拒否パターンの確定
  Given API 認可パターン設計ドキュメントが存在する
  When クロステナントアクセス拒否パターンを確認したとき
  Then DB アクセス時にテナントスキーマ境界を超えない接続切替方式が定義されていること
  And  テナント外リソースへのアクセス試行に対して 403 を返す例が示されていること

Scenario 4: security.md の横断更新
  Given `docs/design/non-functional/security.md` が更新されている
  When 認証・認可テーブルを確認したとき
  Then 認証フェーズに「PBI-SaaS 実装後: Cognito JWT + テナントコンテキスト取得」が追記されていること
  And  認可フェーズに「テナントスキーマ境界チェック」と「DB 認可テーブル参照」が追記されていること
  And  `## 変更履歴` に PBI-SaaS-001d の変更内容が記録されていること

Scenario 5: api-architecture.md の横断更新
  Given `docs/design/non-functional/api-architecture.md` が更新されている
  When 代表パターンを確認したとき
  Then 「認証 + テナントコンテキスト取得 + バリデーション + 書き込み」の代表パターンが追加されていること
  And  `getTenantContext` の使い方が `getOwnerId` と同様のパターンで示されていること
  And  `## 変更履歴` に PBI-SaaS-001d の変更内容が記録されていること

Scenario 6: infrastructure.md の横断更新
  Given `docs/design/non-functional/infrastructure.md` が更新されている
  When CDK スタック構成を確認したとき
  Then Cognito User Pool / Authorizer がスタック構成表に追記されていること
  And  `## 変更履歴` に PBI-SaaS-001d の変更内容が記録されていること
```

---

## ルール（Example Mapping）

- **Rule 1: テナントコンテキストは全認証済みエンドポイントで必ず取得する**
  - Example: `getOwnerId` と同様に `getTenantContext` を先頭で呼び出し、取得失敗時は即 403 を返す。直接 `event.requestContext.authorizer` を参照しない

- **Rule 2: DB 認可チェックは Cognito `tenant_role` の補完として位置づける**
  - Example: `tenant_role: "admin"` は「ユーザー管理が可能」という粗い判定に使う。「請求書を承認できるか」など機能固有の判定は必ず DB テーブルを参照する

- **Rule 3: 接続切替後のスキーマ外アクセスは設計レベルで排除する**
  - Example: Drizzle の接続を切り替えた後は、そのセッション内でテナントスキーマ外のテーブルを参照するコードを書かない

- **Rule 4: 既存ドキュメントの `getOwnerId` パターンを `getTenantContext` パターンへ段階移行させる**
  - Example: 実装 PBI が進む中で `getOwnerId` は `getTenantContext` の戻り値から `userId` を取り出す形に置き換える。設計ドキュメントにその移行経路を記載する

---

## 不明点 / 質問

- API Gateway Authorizer は Lambda Authorizer か JWT Authorizer か（Cognito User Pool との統合方式）？
- DB 認可チェックの結果をリクエスト内でキャッシュするか（Lambda ウォームスタート時の再参照を避けるか）？

---

## INVEST チェック

- **Independent**: NG — SaaS-001a（Cognito / claim 定義）・SaaS-001b（DB / 認可テーブル設計）が完了してから着手する
- **Negotiable**: OK — DB 認可キャッシュの有無・Authorizer 方式は交渉余地あり
- **Valuable**: OK — このパターンが確定しないと全 API ハンドラーの実装 PBI が定義できない
- **Estimable**: OK — 成果物が「API パターン設計ドキュメント + 既存 3 ドキュメントの横断更新」と明確
- **Small**: OK — 設計ドキュメント作成 + 既存ドキュメント更新のみ
- **Testable**: OK — 各受け入れ条件がドキュメントの記載内容で検証可能
