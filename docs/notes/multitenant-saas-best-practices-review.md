---
last_updated: 2026-07-13
---

# マルチテナント SaaS ベストプラクティス準拠調査

## 対象読者・目的

**対象読者**: リポジトリ所有者・バックエンド/インフラ実装者

**目的**: 本プロジェクトのマルチテナント実装（apps/api・infra・docs/design/non-functional）を、
マルチテナント SaaS の一般的ベストプラクティス（AWS Well-Architected SaaS Lens / AWS SaaS Factory の観点）と突き合わせ、
準拠している点と改善候補を優先度付きで整理する。

**対象スコープ**

含む:
- テナント分離モデル・テナント識別・認可
- テナントプロビジョニング / ライフサイクル
- DB 接続戦略・最小権限・暗号化
- テナント単位の可観測性・ノイジーネイバー対策
- 設計ドキュメントと実装の整合

含まない:
- 課金・請求機能の設計（現状スコープ外のため候補として言及するのみ）
- 個別ハンドラーの機能仕様レビュー

**凡例**: 本文中の記述は「事実（コード・ドキュメントで確認済み）」「判断（事実に基づく評価）」「推測（未検証）」を明示して分ける。

---

## 結論（サマリ）

テナント分離の中核設計は堅実で、ベストプラクティスへの準拠度は高い。
スキーマ per テナント分離・JWT ベースのテナント識別（immutable カスタム属性）・ミドルウェアへの認可一元化・サガによるプロビジョニング自動化は、いずれも定石どおり実装され、設計ドキュメントにも根拠が残っている。

一方で、以下の改善候補が見つかった（詳細は後述）。

| # | 優先度 | 内容 |
|---|---|---|
| 1 | 高 | JWT claims の取得パスが REST API 形式と不一致の疑い（デプロイ環境で全 API が 403 になる可能性） |
| 2 | 高 | 全 Lambda が Aurora マスター（admin）資格情報を共有しており DB 層の最小権限が未達 |
| 3 | 高 | DB 接続の TLS 検証が無効（`rejectUnauthorized: false`）／通常接続は TLS 設定なし |
| 4 | 中 | API Gateway にスロットリングがなくノイジーネイバー・コスト暴走対策がない |
| 5 | 中 | 接続戦略が設計ドキュメント（1 リクエスト 1 接続）と実装（テナント別プール無制限キャッシュ）で乖離 |
| 6 | 中 | 構造化ログにテナント ID がなく、テナント単位の可観測性がない |
| 7 | 中 | プロビジョニングのサガで Step 3 失敗時に孤児データベースが残る |
| 8 | 中 | テナント解約（オフボーディング）が設計のみで未実装 |
| 9 | 低 | ロール ID のハードコード、レガシー認証コードの残置 ほか |

---

## 現状のアーキテクチャ（事実）

- **分離モデル**: 共有 Aurora MySQL Serverless v2 クラスター上に `service` / `common`（設計のみ） / `tenant_{slug}` スキーマを置く「スキーマ per テナント」構成（いわゆるブリッジモデル）。[db-schema-multitenant.md](../design/non-functional/db-schema-multitenant.md) に決定として記録済み。
- **テナント識別**: Cognito カスタム属性 `custom:tenant_id` / `custom:user_type`（4 値）。属性は `mutable: false`（[CognitoConstruct.ts:31-32](../../infra/lib/auth/CognitoConstruct.ts#L31-L32)）。
- **認可**: `tenantContext`（Tier 1: テナント解決・所属確認）→ `requirePermission`（Tier 2: resource × action の DB ベース認可）の 2 段ミドルウェア。設計は [api-authz-multitenant.md](../design/non-functional/api-authz-multitenant.md)。
- **プロビジョニング**: `POST /admin/tenants` がサガパターン（7 ステップ + ロールバック）で `service.tenants` 登録 → `CREATE DATABASE` → マイグレーション → ロール/権限シード → Cognito ユーザー作成 → 初期管理者登録を実施（[createTenant.ts](../../apps/api/src/admin/createTenant.ts)）。
- **マイグレーション**: `POST /admin/migrate/all-tenants` が active テナントを列挙し冪等マイグレーションを実行。部分失敗は継続して 207 で報告（[migrateAllTenants.ts](../../apps/api/src/admin/migrateAllTenants.ts)）。

---

## 準拠している点（事実 + 判断）

| ベストプラクティス | 本プロジェクトの状態 | 評価 |
|---|---|---|
| テナント分離モデルを明示的に選定し文書化する | スキーマ per テナントを採用し、命名規則・最大長・変換ルールまで文書化 | ✓ 準拠 |
| テナント ID はクライアント入力でなく検証済みトークンから得る | `tenant_*` ユーザーは JWT クレームのみ使用。`X-Tenant-Id` ヘッダーは無視する設計 | ✓ 準拠 |
| テナント識別属性の改竄防止 | Cognito カスタム属性を immutable 化（ユーザー・Admin API どちらからも変更不可） | ✓ 準拠 |
| 分離の強制はハンドラー個別でなく共有レイヤーで行う | `tenantContext` / `requirePermission` に一元化。ハンドラーは `c.get('tenantDb')` を使うのみ | ✓ 準拠 |
| サービサー（越境アクセス者）のアクセス制御 | `service.user_tenant_roles` で対象テナントへの権限を毎回確認。列挙攻撃対策（404/403 分離）も文書化 | ✓ 準拠 |
| スキーマ名等への入力を信頼しない | スラッグは `validateSlug`（英小文字・数字・ハイフン、2〜32 文字）検証後にのみスキーマ名へ変換。SQL インジェクション余地なし | ✓ 準拠 |
| オンボーディングの自動化 | サガパターンによるワンショットプロビジョニング + ロールバック | ✓ 準拠 |
| テナントライフサイクル状態の管理 | `active` / `suspended` / `deleted` を持ち、全リクエストで status を確認 | ✓ 準拠（解約フローは未実装 → 改善点 8） |
| 全テナント横断マイグレーションの冪等性 | `IF NOT EXISTS` + drizzle migrator + 部分失敗継続 | ✓ 準拠 |
| ネットワーク分離・秘密情報管理 | Aurora は PRIVATE_ISOLATED サブネット、SG 最小許可、認証情報は Secrets Manager（VPC Endpoint 経由） | ✓ 準拠 |
| IaC ガードレール | cdk-nag 導入済み。抑制には理由・影響・見直し条件が付記されている | ✓ 準拠 |

**判断**: 個人学習プロジェクトの規模に対して、テナント境界の設計品質は十分以上。特に「クロステナント対策をハンドラー個別に書かない」方針が設計・実装両方で守られている点は良い。

---

## 改善点

### 1.【高】JWT claims 取得パスが REST API の形式と不一致の疑い

**事実**:
- インフラは `apigateway.RestApi` + `CognitoUserPoolsAuthorizer`（REST API）でデプロイされる（[infra-stack.ts:387-395](../../infra/lib/infra-stack.ts#L387-L395)）。
- 一方、コードは `event.requestContext.authorizer.jwt.claims` を参照する（[types.ts:14-23](../../apps/api/src/hono/types.ts#L14-L23)、[tenantContext.ts:49](../../apps/api/src/shared/middleware/tenantContext.ts#L49)）。
- テストヘルパーもすべて `authorizer.jwt.claims` 形式でイベントをモックしている（mediumTestSetup.ts:136）。

**判断**: `authorizer.jwt.claims` は HTTP API（payload v2）の JWT Authorizer が渡す形式であり、REST API の Cognito Authorizer は `authorizer.claims` 直下に置く。形式が食い違っている。

**推測（未検証）**: デプロイ環境では claims が空になり、認証済みリクエストがすべて 403 になる可能性が高い。テストはモックイベントが同じ前提を共有しているため検出できていない。

**改善案**:
1. デプロイ環境（または SAM local）で実イベントの `requestContext.authorizer` の形を確認する
2. 不一致なら、(a) claims 取得を両形式対応のヘルパーに集約する、(b) HTTP API + JWT Authorizer へ移行する（低コスト方針にも合致）、のいずれかを ADR で決める
3. テストヘルパーのイベント形式を実イベントと一致させる（テストと本番の乖離をなくす）

### 2.【高】全 Lambda が Aurora マスター資格情報を共有（DB 層の最小権限が未達）

**事実**: すべての Lambda（一覧取得のような読み取り系を含む）に `auroraCluster.secret`（`admin` ユーザー）の読み取り権限が付与され、実行時はこの資格情報で接続する（[infra-stack.ts:109](../../infra/lib/infra-stack.ts#L109), 180, 190 ほか / [client.ts:24-54](../../apps/api/src/db/client.ts#L24-L54)）。

**判断**: スキーマ分離はアプリケーション層（`tenantContext` が正しい `tenantDb` を渡すこと）だけで担保されており、DB 層に防壁がない。ハンドラーのバグや依存パッケージ侵害が起きた場合、任意テナントのスキーマに対する読み書き・`DROP DATABASE` まで可能になる。マルチテナントのベストプラクティス（多層防御・最小権限）に反する。

**改善案**（段階的に）:
1. DDL 不要なランタイム Lambda 用に、`tenant_%` / `service` への DML のみ許可した専用 DB ユーザーを作り、Secrets Manager の別シークレットにする
2. マスター資格情報はプロビジョニング / マイグレーション Lambda（`createTenant` / `migrateAllTenants` / `migration` / `setupServiceSchema`）に限定する
3. （将来）テナント単位の DB ユーザー発行や IAM 認証は、コスト・複雑さと見合いで ADR 判断とする

### 3.【高】DB 接続の TLS 検証が無効／未設定

**事実**:
- [migration.ts:39](../../apps/api/src/db/migration.ts#L39) が `ssl: { rejectUnauthorized: false }` で接続している
- [client.ts](../../apps/api/src/db/client.ts) の通常接続・テナント接続には `ssl` 設定自体がない

**判断**: VPC 内通信のため実害リスクは低いが、証明書検証の無効化は [security.md](../design/non-functional/security.md) の方針および cdk-nag を導入する姿勢と整合しない。Aurora MySQL は RDS CA バンドルによる TLS 接続を標準サポートしており、対応コストは小さい。

**改善案**: RDS CA バンドル（`ap-northeast-1` 用）を Lambda に同梱または AWS 提供のグローバルバンドルを使用し、全接続で `ssl: { ca }` + 検証有効に統一する。

### 4.【中】API スロットリング・ノイジーネイバー対策がない

**事実**: `RestApi` にステージスロットリング・usage plan・WAF の設定がない（WAF・アクセスログはコスト理由の抑制として文書化済み）。

**判断**: マルチテナント SaaS では「1 テナントの暴走が他テナントの体験と *運営コスト* を毀損しない」ことが定石。本プロジェクトは AWS 利用料抑制が最優先制約であり、Lambda + Aurora の呼び出し暴走はコスト事故に直結するため、無料でできる範囲の防御は入れる価値がある。

**改善案**:
1. ステージレベルのスロットリング（例: rate 10 rps / burst 20 程度）を設定する — 追加コストなし
2. テナント単位のスロットリング（usage plan + API キー、または Lambda 内カウンタ）は、必要になった時の導入条件を ADR に残す

### 5.【中】接続戦略が設計ドキュメントと実装で乖離

**事実**:
- [db-schema-multitenant.md](../design/non-functional/db-schema-multitenant.md) は「**1 リクエスト 1 接続**（接続プールを使わない）。トラフィック増加時は RDS Proxy を検討」と定めている
- 実装は `mysql.createPool`（connectionLimit: 1）をテナント slug ごとに生成し、モジュールスコープの `Map` に**上限なく**キャッシュしている（[client.ts:81-106](../../apps/api/src/db/client.ts#L81-L106)）

**判断**: 現テナント数では問題にならないが、「ウォーム Lambda コンテナ数 × コンテナが触ったテナント数」だけ接続が滞留する構造で、テナント増加時に Aurora の max_connections を圧迫する。また設計と実装が食い違ったままだと、後続の判断（RDS Proxy 導入時期など）の前提が崩れる。

**改善案**:
1. まず設計ドキュメントを実態（プール + キャッシュ）に合わせて更新し、乖離を解消する
2. キャッシュに上限（LRU）を設ける、またはアイドル接続の解放を設定する
3. RDS Proxy の導入条件（テナント数・同時実行数の閾値）を ADR に残す

### 6.【中】テナント単位の可観測性がない

**事実**: [logger.ts](../../apps/api/src/shared/logger.ts) の標準フィールドは `requestId` / `userId` / `villageId` のみで、テナント識別子がない。API Gateway アクセスログ・CloudWatch ログは未設定（コスト理由で抑制済み）。

**判断**: 「どのテナントがどれだけ使っているか」を測れることはマルチテナント SaaS 運用の基本（障害調査・コスト帰属・将来の課金の土台）。tenantSlug は `tenantContext` 通過後に必ず手元にあるため、ログに載せるコストはほぼゼロ。

**改善案**:
1. `LogFields` に `tenantSlug` を追加し、認証済みハンドラーのログには必ず含める規約にする
2. （将来）CloudWatch EMF などでテナント別呼び出し回数メトリクスを出す条件を ADR に残す

### 7.【中】サガの Step 3 失敗時に孤児データベースが残る

**事実**: [createTenant.ts](../../apps/api/src/admin/createTenant.ts) の `runSaga` は「実行に**成功した**ステップ」だけをロールバックする。Step 2（`CREATE DATABASE`）のロールバックは「Step 3 のロールバックで DROP するため何もしない」と実装されているが、Step 3 の execute 自体が失敗した場合、Step 3 は executed に入らないためその DROP は実行されない。

**判断**: 結果として `service.tenants` レコードは消えるのに `tenant_{slug}` データベース（部分的にマイグレーション済みの可能性あり）が残る。`CREATE DATABASE IF NOT EXISTS` のため同一 slug の再発行は成功するが、失敗時の残骸を引き継いだ状態で成功してしまうリスクがある。

**改善案**: Step 2 のロールバックに `DROP DATABASE IF EXISTS` を実装する（現在の「何もしない」を廃止）。DROP は冪等なので Step 3 以降の失敗時と重複しても害はない。

### 8.【中】テナント解約（オフボーディング）が未実装

**事実**: [db-schema-multitenant.md](../design/non-functional/db-schema-multitenant.md) に解約手順（`DROP DATABASE` → status を `'deleted'` に更新）が定義されているが、対応する API・Lambda は存在しない。テナント単位のデータエクスポートや、共有クラスターにおける単一テナント復旧手順（クラスタ全体の PITR しかないため、復旧には別クラスタへのリストア + ダンプが必要）も文書化されていない。

**判断**: テナントのライフサイクルは「作る」だけでなく「止める・消す・返す（データ持ち出し）」まで揃って初めて完結する。特に共有クラスター構成では単一テナント復旧が難しいことを認識として残しておくべき。

**改善案**:
1. 解約 API（suspend → deleted の 2 段階）を PBI 化する
2. [db-operations.md](../design/non-functional/db-operations.md) に「単一テナントのバックアップ・復旧の限界と手順（mysqldump 等）」を追記する

### 9.【低】その他の小さな改善候補

| 対象 | 内容 | 改善案 |
|---|---|---|
| [createTenant.ts:293](../../apps/api/src/admin/createTenant.ts#L293) | 初期管理者へのロール付与が `roleId: 1` のハードコード。Step 4 の INSERT 順序に暗黙依存 | `roles` テーブルから `name = 'tenant_admin'` で引く |
| [shared/auth.ts](../../apps/api/src/shared/auth.ts) | 旧 `getOwnerId`（`X-User-Id` ヘッダー = クライアント申告の身元）が残存。参照はテストのみ | 移行完了を確認して削除（誤って新規コードから使われる事故を防ぐ） |
| `common` スキーマ | 設計のみで未実装（設計ドキュメントに明記済み） | 現状のままで問題なし。実装時に READ ONLY 制約の担保方法を決める |
| `GET /api/my/permissions` | [api-authz-multitenant.md](../design/non-functional/api-authz-multitenant.md) に設計があるが未実装 | PBI-SaaS-007（ユーザー管理画面）と合わせて実装 |
| テナント単位のメータリング・クォータ | 未着手（課金がないため妥当） | 将来課金を扱う場合の前提として改善点 6（テナント別ログ）を先に入れておく |

---

## ベストプラクティス対応表（総括）

| SaaS Lens 観点 | 状態 |
|---|---|
| テナント分離（Isolation） | ◎ 設計・実装とも一貫。ただし DB 層の最小権限（改善点 2）で多層防御が未達 |
| テナント識別（Identity） | ◎ JWT + immutable 属性。claims パス不一致（改善点 1）の検証が必要 |
| オンボーディング自動化 | ○ サガで自動化済み。ロールバックの隙（改善点 7） |
| オフボーディング | △ 設計のみ（改善点 8） |
| テナント認可（Tier 分割） | ◎ 2 段ミドルウェアに一元化 |
| ノイジーネイバー対策 | △ スロットリングなし（改善点 4） |
| テナント認識可観測性 | △ ログにテナント ID なし（改善点 6） |
| メータリング / 課金 | −（スコープ外。現状は妥当） |
| データ保護（暗号化・TLS） | ○ ストレージ暗号化済み。転送時 TLS の検証（改善点 3） |
| デプロイ / マイグレーション | ◎ 冪等・全テナント一括・部分失敗継続 |

---

## 推奨する着手順

1. **改善点 1（claims パス）** — 動作可否に直結するため最優先で検証
2. **改善点 2 + 3（DB 最小権限と TLS）** — セキュリティ多層化。1 つの PBI にまとめられる規模
3. **改善点 7（サガの孤児 DB）** — 修正 1 箇所 + テスト追加で完了する小粒タスク
4. **改善点 5 + 6（接続戦略の整合・テナントログ）** — ドキュメント更新を伴う中粒タスク
5. **改善点 4 / 8** — ADR / PBI 起こしから始める

---

## 変更履歴

| 日付 | 変更内容 |
|---|---|
| 2026-07-13 | 初版作成。マルチテナント SaaS ベストプラクティス準拠調査の結果を記録 |
