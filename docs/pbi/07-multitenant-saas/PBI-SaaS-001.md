# PBI-SaaS-001 マルチテナント SaaS 化 — エピック概要

作成日: 2026-06-17

---

## 概要

このシステムをマルチテナント SaaS として動かすために必要な設計を行うエピック。
設計は以下 4 つの子 PBI に分割される。実装 PBI はこれらの設計完了後に定義する。

| 子 PBI | タイトル |
|---|---|
| [PBI-SaaS-001a](PBI-SaaS-001a.md) | Cognito 設計（claim 定義・グループ構成） |
| [PBI-SaaS-001b](PBI-SaaS-001b.md) | DB スキーマ per テナント設計（命名規則・接続切替・認可テーブル） |
| [PBI-SaaS-001c](PBI-SaaS-001c.md) | テナントプロビジョニング・ユーザー管理フロー設計 |
| [PBI-SaaS-001d](PBI-SaaS-001d.md) | API 認可パターン設計 + 既存ドキュメント横断更新 |

---

## アクター定義（確定）

| 識別子 | 名称 | 所属 | テナントアクセス |
|---|---|---|---|
| `servicer_admin` | サービサーのシステム管理者 | サービサー側 | 複数（全テナントまたは指定テナント群）。テナント切り替えあり |
| `servicer_delegate` | サービサーの管理移譲アルバイター | サービサー側 | 複数（割り当てテナント群）。テナント切り替えあり |
| `tenant_admin` | テナントシステム管理者 | テナント側 | 特定の 1 テナントのみ（固定） |
| `tenant_user` | テナント一般利用者 | テナント側 | 特定の 1 テナントのみ（固定） |

`servicer_*` は JWT に `custom:tenant_id` を持たず、リクエストヘッダー `X-Tenant-Id` でテナントを指定する。
`tenant_*` はアカウント作成時に所属テナントが確定し、JWT の `custom:tenant_id` に埋め込まれる。

---

## 確定済み方針

| 項目 | 決定内容 |
|---|---|
| テナント ID 形式 | スラッグ（英数字・ハイフン等）。サービサーがテナント追加時に決定し、後から変更不可 |
| Cognito User Pool | 全テナント共用 1 Pool（コスト最優先） |
| JWT クレーム | `custom:user_type`（全ユーザー: 4 種別）。`custom:tenant_id`（`tenant_*` のみ。`servicer_*` はなし） |
| 認可モデル | ホワイトリスト RBAC。Tier 1: テナントアクセス確認（`service.user_tenant_roles`）/ Tier 2: resource × action の機能認可。`servicer_admin` は Tier 2 スキップ |
| API 実装 | Cognito JWT Authorizer（API Gateway）+ Hono ミドルウェア（Lambda 内）で認可を集約 |
| ユーザー管理画面 | テナントの機能に内包（SaaS アプリ内に設ける） |
| テナント発行 | `servicer_admin` が行う。テナントユーザーによる自己発行なし |
| DB 分離方式 | Aurora MySQL 上のスキーマ per テナント（コスト抑制）。`service` / `common` / `tenant_{slug}` の 3 スキーマ構成 |
