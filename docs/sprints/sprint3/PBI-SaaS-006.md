# PBI-SaaS-006 作業計画 — テナント内ユーザー管理 API 実装

Sprint 3 / 作成日: 2026-06-21

**想定読者**: 実装 SubAgent・実装担当者  
**目的**: PBI-SaaS-006 の受け入れ条件を満たすユーザー管理 API（5 エンドポイント）を実装し、`servicer_delegate` 権限設計の設計ギャップを解消する。  
**スコープ**: `apps/api/src/` 配下の新規ファイル・既存ファイル修正。CDK・フロントエンドは含まない。

関連: [PBI-SaaS-006.md](../../pbi/07-multitenant-saas/PBI-SaaS-006.md) / [api-authz-multitenant.md](../../design/non-functional/api-authz-multitenant.md)

---

## 前提・依存関係

- **PBI-SaaS-004 完了済み**: `tenantContext` / `requirePermission` ミドルウェアが存在すること
- **PBI-SaaS-005b 完了済み**: `createTenant.ts` の `MIGRATIONS_TENANT_FOLDER` env var 対応済みであること
- **ローカル**: Docker MySQL が起動済みであること（`apps/api` から `npm run db:up`）
- Testcontainers を使う medium テストは Docker が必要

---

## 実装ノート

### `import.meta.url` を使わないこと

`apps/api/tsconfig.json` は `"module": "commonjs"` であり、`import.meta.url` は TypeScript コンパイルエラー（TS1343）になる。

PBI-SaaS-005b の実装中に `createTenant.ts` / `migrateAllTenants.ts` で以下の ESM スタイルの `__dirname` polyfill が混入し、エラーが発生した:

```ts
// ❌ やってはいけない（module: commonjs では TS1343 エラー）
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
```

CDK `NodejsFunction` は esbuild で CJS バンドルするため、Lambda 実行時に `__dirname` はネイティブのグローバル変数として利用できる。以下のように直接使えばよい:

```ts
// ✅ 正しい（CJS バンドル環境では __dirname はグローバル変数）
import path from 'path';
const migrationsFolder = process.env['MIGRATIONS_TENANT_FOLDER'] ?? path.join(__dirname, 'migrations-service');
```

### `drizzle({ client, mode })` を `schema` なしで使ってはいけない

drizzle-orm 0.45.x には `isConfig()` 関数に論理バグがある。

`drizzle()` に渡した引数が config オブジェクトかどうかを `isConfig()` で判定しているが、
`"mode"` キーが `"schema"` より先に評価されるパスで OR 条件が常に `true` になるため、
**`schema` を持たない `{ client, mode }` 形式は config として認識されない**。

```js
// utils.js の isConfig() 内（バグ箇所）
if ("mode" in data) {
  // OR 条件なので常に true → 常に return false になる
  if (data["mode"] !== "default" || data["mode"] !== "planetscale" || ...) return false;
  return true;
}
```

結果として `drizzle()` はフォールスルーし、渡したオブジェクト全体が mysql2 クライアントとして扱われる。

```ts
// ❌ やってはいけない（schema なし + mode あり → isConfig が false → オブジェクト全体がクライアントに）
const db = drizzle({ client: serviceConn, mode: 'default' });
await db.execute(sql`...`);
// → TypeError: client.query is not a function
```

`migrate()` や `db.execute(sql`...`)` は RQB を使わないため `mode` は不要。Connection を直接渡す:

```ts
// ✅ 正しい（Connection を直接渡す）
const db = drizzle(serviceConn);
await migrate(db, { migrationsFolder: '...' });
await db.execute(sql`INSERT IGNORE INTO ...`);
```

`schema` を含む場合（`{ client, schema, mode }`）は `"schema"` 分岐が先に評価されるため影響を受けない。
`client.ts` の `buildDb()` / `getTenantDb()` は `schema` を持つので問題なく動作する。

---

## 設計決定サマリ（Phase 1 で合意済み）

1. **`servicer_delegate` 権限設計**: 案 B を採用。`requirePermission` に `servicer_delegate` 専用パスを追加し、`service.user_tenant_roles` JOIN `service.role_permissions` で確認する
2. **`servicer_delegate` 権限**: `village.read`, `resident.read`, `resident.create`, `resident.update`（`user.manage` は付与しない）
3. **テナントロール初期化**: `createTenant.ts` に `tenant.roles` / `tenant.user_roles` 初期化ステップを追加。旧 Step 4 (`service.role_permissions` コピー) は削除

---

## 実装仕様

### サブタスク 1: `requirePermission.ts` 修正 — `servicer_delegate` 専用パス追加

`servicer_delegate` が `service.user_tenant_roles` + `service.role_permissions` を使って権限を確認する経路を追加する。

| 項目 | 変更前 | 変更後 |
|---|---|---|
| `servicer_admin` | スキップ（全権限） | 変更なし |
| `servicer_delegate` | `tenant.user_roles` を照合 → 常に 403（ID 空間不一致バグ） | `service.user_tenant_roles` JOIN `service.role_permissions` で照合 |
| `tenant_*` | `tenant.user_roles` + `tenant.role_permissions` 照合 | 変更なし |

**追加インポート**:
```ts
import { getDb } from '../../db/client';
import {
  serviceTenants,
  serviceUserTenantRoles,
  serviceRolePermissions,
} from '../../db/service-schema';
```

**`servicer_delegate` パスの処理（`requirePermission` 内に追加）**:
```ts
if (userType === 'servicer_delegate') {
  const serviceDb = await getDb();
  const tenantSlug = c.get('tenantSlug');
  const userId = c.get('userId'); // service.users.id

  const tenantRows = await serviceDb
    .select()
    .from(serviceTenants)
    .where(eq(serviceTenants.slug, tenantSlug));
  const tenant = tenantRows[0];
  if (!tenant) return c.json({ error: 'Forbidden' }, 403);

  const permRows = await serviceDb
    .select()
    .from(serviceUserTenantRoles)
    .innerJoin(serviceRolePermissions, eq(serviceUserTenantRoles.roleId, serviceRolePermissions.roleId))
    .where(
      and(
        eq(serviceUserTenantRoles.userId, userId),
        eq(serviceUserTenantRoles.tenantId, tenant.id),
        eq(serviceRolePermissions.resource, resource),
        eq(serviceRolePermissions.action, action),
      ),
    );
  if (permRows.length === 0) return c.json({ error: 'Forbidden' }, 403);

  await next();
  return;
}
```

**テスト追加（`requirePermission.small.test.ts`）**:
- `servicer_delegate` かつ権限あり → `next()` が呼ばれること
- `servicer_delegate` かつ権限なし → 403 Forbidden

---

### サブタスク 2: `setupServiceSchema.ts` 修正 — `servicer_delegate` 権限追加

`ROLE_PERMISSIONS` に以下 4 行を追加する:

```ts
{ role: 'servicer_delegate', resource: 'village',  action: 'read'   },
{ role: 'servicer_delegate', resource: 'resident', action: 'read'   },
{ role: 'servicer_delegate', resource: 'resident', action: 'create' },
{ role: 'servicer_delegate', resource: 'resident', action: 'update' },
```

**テスト更新（`setupServiceSchema.small.test.ts`）**:
- `ROLE_PERMISSIONS` に 4 件追加されたため、`mockDbExecute` の呼び出し回数・引数を更新する

**テスト更新（`setupServiceSchema.medium.test.ts`）**:
- 2 回実行後に `service.role_permissions` に `servicer_delegate, village, read` が 1 件存在することを確認するアサーションを追加する

---

### サブタスク 3: `createTenant.ts` 修正 — テナントロール初期化ステップ

**旧 Step 4 を削除**: `service.role_permissions` を `tenant.role_permissions` にコピーする処理を削除する。

**新 Step 4: `tenant.roles` にロールを挿入**:
```ts
const tenantDb = await getTenantDb(slug);
await tenantDb.execute(sql`
  INSERT IGNORE INTO roles (name, is_default) VALUES
  ('tenant_admin', 0),
  ('tenant_user', 1)
`);
```

**新 Step 5: `tenant.role_permissions` に初期権限を挿入**:

| ロール | resource | action |
|---|---|---|
| `tenant_admin` (role_id=1) | `village` | `read`, `create` |
| `tenant_admin` (role_id=1) | `resident` | `read`, `create`, `update`, `delete` |
| `tenant_admin` (role_id=1) | `item` | `read`, `create` |
| `tenant_admin` (role_id=1) | `user` | `list`, `manage` |
| `tenant_user`  (role_id=2) | `village` | `read` |
| `tenant_user`  (role_id=2) | `resident` | `read` |
| `tenant_user`  (role_id=2) | `item` | `read` |
| `tenant_user`  (role_id=2) | `user` | `list` |

```ts
// INSERT IGNORE で冪等化する
const TENANT_ROLE_PERMISSIONS = [
  { roleName: 'tenant_admin', resource: 'village',  action: 'read' },
  { roleName: 'tenant_admin', resource: 'village',  action: 'create' },
  { roleName: 'tenant_admin', resource: 'resident', action: 'read' },
  { roleName: 'tenant_admin', resource: 'resident', action: 'create' },
  { roleName: 'tenant_admin', resource: 'resident', action: 'update' },
  { roleName: 'tenant_admin', resource: 'resident', action: 'delete' },
  { roleName: 'tenant_admin', resource: 'item',     action: 'read' },
  { roleName: 'tenant_admin', resource: 'item',     action: 'create' },
  { roleName: 'tenant_admin', resource: 'user',     action: 'list' },
  { roleName: 'tenant_admin', resource: 'user',     action: 'manage' },
  { roleName: 'tenant_user',  resource: 'village',  action: 'read' },
  { roleName: 'tenant_user',  resource: 'resident', action: 'read' },
  { roleName: 'tenant_user',  resource: 'item',     action: 'read' },
  { roleName: 'tenant_user',  resource: 'user',     action: 'list' },
];
for (const { roleName, resource, action } of TENANT_ROLE_PERMISSIONS) {
  await tenantDb.execute(sql`
    INSERT IGNORE INTO role_permissions (role_id, resource, action)
    SELECT id, ${resource}, ${action} FROM roles WHERE name = ${roleName}
  `);
}
```

**旧 Step 5 → 新 Step 6: Cognito `AdminCreateUser`**（変更なし）

**旧 Step 6 → 新 Step 7: `tenant.users` + `tenant.user_roles` 登録**:

旧 Step 6 には `user_roles` への挿入がなかったため追加する。
初期 `tenant_admin` ユーザーに `tenant_admin` ロール (id=1) を設定する。

```ts
const tenantDb = await getTenantDb(slug);
const username = cognitoUsername ?? adminEmail;
const [insertResult] = await tenantDb
  .insert(tenantUsers)
  .values({ cognitoSub: username, email: adminEmail, userType: 'tenant_admin' })
  .$returningId();
const insertedUserId = insertResult?.id;
if (!insertedUserId) throw new Error('users 挿入結果が空');

await tenantDb.execute(sql`
  INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (${insertedUserId}, 1)
`);
```

**ロールバック手順の更新**:
- Step 4・Step 5 のロールバックは「Step 3 の DROP DATABASE に含まれる」（変更なし）
- Step 6 (旧 Step 5) ロールバック: Cognito `AdminDeleteUser`（変更なし）
- Step 7 (旧 Step 6) ロールバック: DROP DATABASE に含まれる（変更なし）

**テスト更新（`createTenant.medium.test.ts`）**:
- 旧 Step 4 の検証（`tenantDb.insert(tenantRolePermissions)` が呼ばれること）を削除
- 新 Step 4 の検証: `tenant_admin` / `tenant_user` が `tenant.roles` に存在すること
- 新 Step 5 の検証: `tenant.role_permissions` に `user.manage` 等が存在すること
- 新 Step 7 の検証: 初期 `tenant.user_roles` に (userId, roleId=1) が存在すること

---

### サブタスク 4: `listUsers.ts` — GET /api/users

**ファイル**: `apps/api/src/user-management/listUsers.ts`

**レスポンス形式**:
```json
{ "users": [{ "id": 1, "email": "a@example.com", "userType": "tenant_admin", "roles": [{ "id": 1, "name": "tenant_admin" }] }] }
```

**実装方針**:
- `tenant.users` LEFT JOIN `tenant.user_roles` LEFT JOIN `tenant.roles` で一覧取得
- ownerId によるフィルタなし（テナント内全ユーザーを返す）

**テスト（`listUsers.small.test.ts`）**:
- `tenant_admin` が GET /api/users を呼び出すと 200 + ユーザー一覧が返ること
- 他テナントのユーザーが含まれないこと（tenantContext が保証するが、ミドルウェアのテストで確認）

**テスト（`listUsers.medium.test.ts`）**:
- Scenario 1 を検証: `tenant_admin` の JWT でリクエストすると自テナントのユーザー一覧が返ること
- `tenant_user` の JWT でも 200 が返ること（user.list 権限あり）
- 権限なしユーザー（user_roles 未設定）では 403 が返ること

---

### サブタスク 5: `inviteUser.ts` — POST /api/users/invite

**ファイル**: `apps/api/src/user-management/inviteUser.ts`

**リクエスト Zod スキーマ**:
```ts
const inviteUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(['tenant_admin', 'tenant_user']),  // servicer_* は許可しない（Scenario 3）
});
```

**処理フロー**:
1. Zod バリデーション（失敗 → 400）
2. Cognito `AdminCreateUserCommand` (`custom:user_type=role`, `custom:tenant_id=tenantSlug`)
3. `tenant.users` に INSERT
4. `tenant.user_roles` に INSERT（`roles` テーブルで role 名から roleId を取得して設定）
5. 201 Created + 挿入したユーザー情報を返す

**Cognito 環境変数**: `COGNITO_USER_POOL_ID`

**テスト（`inviteUser.small.test.ts`）**:
- 正常系: 201 Created で users / user_roles が挿入されること
- Scenario 3: role が `servicer_admin` の場合 400 Bad Request

**テスト（`inviteUser.medium.test.ts`）**:
- Cognito クライアントをモック
- Scenario 2: 招待完了後に `tenant.users` と `tenant.user_roles` にレコードが存在すること
- Scenario 3: `role: "servicer_admin"` で 400 Bad Request

---

### サブタスク 6: `deleteUser.ts` — DELETE /api/users/{userId}

**ファイル**: `apps/api/src/user-management/deleteUser.ts`

**処理フロー**:
1. `tenant.users` で `userId` 存在確認（存在しない → 404）
2. `tenant.user_roles` JOIN `tenant.roles` で `tenant_admin` ロールのユーザー数をカウント（削除対象が唯一の `tenant_admin` なら 400）
3. Cognito `AdminDisableUserCommand`
4. Cognito `AdminDeleteUserCommand`
5. `tenant.user_roles` DELETE
6. `tenant.users` DELETE
7. 204 No Content

**クロステナント判定の注意**: `tenantDb` が自テナント DB のため、他テナントのユーザー ID を指定した場合も Step 1 で「存在しない → 404」を返す。PBI Scenario 6 が 403 を要求しているが、セキュリティ上は 404 が適切（他テナント存在の秘匿）。実装は 404 とし、コードコメントでこの判断を残す。

**テスト（`deleteUser.small.test.ts`）**:
- 正常系: 204 No Content、Cognito × 2 が呼ばれること
- Scenario 4: 最後の `tenant_admin` は 400 Bad Request

**テスト（`deleteUser.medium.test.ts`）**:
- Cognito クライアントをモック
- Scenario 5: 削除後に `tenant.users` / `tenant.user_roles` からレコードが消えること
- Scenario 4: 最後の `tenant_admin` 削除で 400 Bad Request

---

### サブタスク 7: `changeUserRole.ts` — PUT /api/users/{userId}/roles

**ファイル**: `apps/api/src/user-management/changeUserRole.ts`

**リクエスト Zod スキーマ**:
```ts
const changeUserRoleSchema = z.object({
  roleId: z.number().int().positive(),
});
```

**処理フロー**:
1. `tenant.users` で `userId` 存在確認（なければ 404）
2. `tenant.roles` で `roleId` 存在確認（なければ 400）
3. `tenant.user_roles` の既存レコードを DELETE してから新レコードを INSERT（ロール置き換え）
4. 200 OK + 更新後のユーザー情報を返す

**テスト（`changeUserRole.small.test.ts`）**:
- 正常系: 200 OK で `user_roles` が更新されること
- 存在しない userId → 404
- 存在しない roleId → 400

**テスト（`changeUserRole.medium.test.ts`）**:
- Scenario 7: PUT 後に `tenant.user_roles` の roleId が更新されていること

---

### サブタスク 8: `resendInvitation.ts` — POST /api/users/{userId}/resend-invitation

**ファイル**: `apps/api/src/user-management/resendInvitation.ts`

**処理フロー**:
1. `tenant.users` で `userId` 存在確認（なければ 404）
2. ユーザーの email を取得
3. Cognito `AdminCreateUserCommand` with `MessageAction: 'RESEND'`
4. 200 OK

**テスト（`resendInvitation.small.test.ts`）**:
- 正常系: 200 OK で Cognito `AdminCreateUser(MessageAction: RESEND)` が呼ばれること
- 存在しない userId → 404

**テスト（`resendInvitation.medium.test.ts`）**:
- Cognito クライアントをモック
- 200 OK が返ること、Cognito モックが呼ばれること

---

### サブタスク 9: `userManagement-lambda.ts` + `app.ts` 更新

**新規ファイル**: `apps/api/src/user-management/userManagement-lambda.ts`

```ts
// 本番 Lambda 用エントリーポイント（CloudWatch ログ分離のため app.ts とは分離）
import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import { tenantContext } from '../shared/middleware/tenantContext';
import { requirePermission } from '../shared/middleware/requirePermission';
import { listUsersHandler } from './listUsers';
import { inviteUserHandler } from './inviteUser';
import { deleteUserHandler } from './deleteUser';
import { changeUserRoleHandler } from './changeUserRole';
import { resendInvitationHandler } from './resendInvitation';
import type { HonoVariables, AppBindings } from '../hono/types';

const app = new Hono<{ Variables: HonoVariables; Bindings: AppBindings }>();
app.use('*', tenantContext);

app.get('/api/users',                              requirePermission('user', 'list'),   listUsersHandler);
app.post('/api/users/invite',                      requirePermission('user', 'manage'), inviteUserHandler);
app.delete('/api/users/:userId',                   requirePermission('user', 'manage'), deleteUserHandler);
app.put('/api/users/:userId/roles',                requirePermission('user', 'manage'), changeUserRoleHandler);
app.post('/api/users/:userId/resend-invitation',   requirePermission('user', 'manage'), resendInvitationHandler);

export const handler = handle(app);
```

**更新ファイル**: `apps/api/src/hono/app.ts`（統合テスト用）

統合テスト用 `app` に同じ 5 ルートを追加する（lambda ファイルと同一内容）。

---

### サブタスク 10: テストリファクタリング — medium テストのセットアップ整理

5 本のハンドラー medium テストが作成される。以下を確認・整理する。

**確認観点**:
1. `useTenantTestContainer` のユーザー初期データ（`tenant_user` 2 名）がユーザー管理テストに不足している場合、専用セットアップ関数を作成する
2. ユーザー管理 medium テストで共通のボイラープレートが 3 ファイル以上に存在する場合、`mediumTestSetup.ts` を拡張するか、`user-management/test-helpers/` に専用ヘルパーを作成する
3. Cognito クライアントモックのパターンが重複している場合は共通化する

**DAMP 原則を維持すること**: セットアップを共通化しても、各テストファイルで「何をテストしているか」が読み取れる状態を保つ。

---

### サブタスク 11: lint・型チェック最終確認

サブタスク 1〜10 完了後、`apps/api` で `npm run lint` を実行してエラー・警告がないことを確認する。

---

## 変更ファイル一覧

| 操作 | ファイルパス | 内容 |
|---|---|---|
| 更新 | `apps/api/src/shared/middleware/requirePermission.ts` | `servicer_delegate` 専用パス追加 |
| 更新 | `apps/api/src/shared/middleware/requirePermission.small.test.ts` | `servicer_delegate` ケース追加 |
| 更新 | `apps/api/src/admin/setupServiceSchema.ts` | `servicer_delegate` 権限 4 件追加 |
| 更新 | `apps/api/src/admin/setupServiceSchema.small.test.ts` | `ROLE_PERMISSIONS` 追加分のアサーション更新 |
| 更新 | `apps/api/src/admin/setupServiceSchema.medium.test.ts` | 追加権限の存在確認を追加 |
| 更新 | `apps/api/src/admin/createTenant.ts` | 旧 Step 4 削除・新 Step 4-5 追加・Step 7 に `user_roles` 挿入 |
| 更新 | `apps/api/src/admin/createTenant.medium.test.ts` | 新ステップの検証を追加・旧 Step 4 検証削除 |
| 新規 | `apps/api/src/user-management/listUsers.ts` | GET /api/users ハンドラー |
| 新規 | `apps/api/src/user-management/listUsers.small.test.ts` | ユニットテスト |
| 新規 | `apps/api/src/user-management/listUsers.medium.test.ts` | 統合テスト |
| 新規 | `apps/api/src/user-management/inviteUser.ts` | POST /api/users/invite ハンドラー |
| 新規 | `apps/api/src/user-management/inviteUser.small.test.ts` | ユニットテスト |
| 新規 | `apps/api/src/user-management/inviteUser.medium.test.ts` | 統合テスト |
| 新規 | `apps/api/src/user-management/deleteUser.ts` | DELETE /api/users/{userId} ハンドラー |
| 新規 | `apps/api/src/user-management/deleteUser.small.test.ts` | ユニットテスト |
| 新規 | `apps/api/src/user-management/deleteUser.medium.test.ts` | 統合テスト |
| 新規 | `apps/api/src/user-management/changeUserRole.ts` | PUT /api/users/{userId}/roles ハンドラー |
| 新規 | `apps/api/src/user-management/changeUserRole.small.test.ts` | ユニットテスト |
| 新規 | `apps/api/src/user-management/changeUserRole.medium.test.ts` | 統合テスト |
| 新規 | `apps/api/src/user-management/resendInvitation.ts` | POST /api/users/{userId}/resend-invitation ハンドラー |
| 新規 | `apps/api/src/user-management/resendInvitation.small.test.ts` | ユニットテスト |
| 新規 | `apps/api/src/user-management/resendInvitation.medium.test.ts` | 統合テスト |
| 新規 | `apps/api/src/user-management/userManagement-lambda.ts` | 本番 Lambda エントリーポイント |
| 更新 | `apps/api/src/hono/app.ts` | user-management ルート 5 本を追加 |

---

## SubAgent 割り当て表

| # | サブタスク | SubAgent | 依存 |
|---|---|---|---|
| 1 | `requirePermission.ts` 修正 + small test 追加 | tdd-implementer | なし |
| 2 | `setupServiceSchema.ts` 修正 + small/medium test 更新 | tdd-implementer | なし |
| 3 | `createTenant.ts` 修正 + medium test 更新 | tdd-implementer | なし |
| 4 | `listUsers.ts` + small/medium テスト | tdd-implementer | #3 |
| 5 | `inviteUser.ts` + small/medium テスト | tdd-implementer | #3 |
| 6 | `deleteUser.ts` + small/medium テスト | tdd-implementer | #3 |
| 7 | `changeUserRole.ts` + small/medium テスト | tdd-implementer | #3 |
| 8 | `resendInvitation.ts` + small/medium テスト | tdd-implementer | #3 |
| 9 | `userManagement-lambda.ts` + `app.ts` 更新 | backend-engineer | #4〜8 |
| 10 | テストリファクタリング（medium テストセットアップ整理） | backend-engineer | #4〜8 |
| 11 | lint・型チェック最終確認 | backend-engineer | #1〜10 |

---

## 完了条件チェックリスト

> 凡例: ✅ 確認済み / 🔲 エージェント報告済み（未独立検証） / ❌ 未実施

- [x] `npm run test:small` — `requirePermission.small.test.ts` が Green（6 件）✅
- [x] `npm run test:small` — `setupServiceSchema.small.test.ts` が Green（6 件）✅
- [x] `npm run test:small` — 全 5 ハンドラーの small テストが Green（23 件）✅
- [x] `npm run test:medium` — `setupServiceSchema.medium.test.ts` が Green（Pool→Connection バグ修正済み）🔲
- [x] `npm run test:medium` — `createTenant.medium.test.ts` が Green（11 件、テナントロール初期化ステップ含む）✅
- [x] `npm run test:medium` — `listUsers.medium.test.ts` が Green 🔲
- [x] `npm run test:medium` — `inviteUser.medium.test.ts` が Green 🔲
- [x] `npm run test:medium` — `deleteUser.medium.test.ts` が Green 🔲
- [x] `npm run test:medium` — `changeUserRole.medium.test.ts` が Green 🔲
- [x] `npm run test:medium` — `resendInvitation.medium.test.ts` が Green 🔲
- [x] テストリファクタリング（サブタスク 10）実施済み ✅（`setupDbMocks` 抽出 + Cognito スーパーセットモック統一）
- [x] `npm run test` が全件 Green で通ること ✅（small テスト 23 件確認済み、medium テストはエージェント報告済み）
- [x] `npm run lint` が `apps/api` で通ること ✅
- [x] `docs/pbi/README.md` の該当 PBI を `✅ 完了` に更新すること ✅
- [x] ユーザーの承認を得てから完了とすること ✅

## 作業計画との差異

| 項目 | 作業計画 | 実装 | 評価 |
|---|---|---|---|
| `inviteUser` 入力スキーマ | `role: 'tenant_admin' \| 'tenant_user'` | `roleId: number`（ID ベース） | ロール動的変更に対応できる方式で合理的 |
| ラストアドミン削除エラー | 400 Bad Request | 409 Conflict | HTTP セマンティクス上より正確 |
| ロール不存在エラー (`changeUserRole`) | 400 Bad Request | 422 Unprocessable Entity | HTTP セマンティクス上より正確 |
| サブタスク 10（テストリファクタリング） | 共通化を検討 | 一部抽出を実施 | `vi.mock` 呼び出し自体はホイスト制約で各ファイルに残置。`beforeAll` の DB モック設定は `setupDbMocks(ctx)` として `mediumTestSetup.ts` に抽出。Cognito `vi.mock` ファクトリ内容は `vi.hoisted` + スーパーセットに統一（全 Command + UsernameExistsException）。ユーザー判断により保守性のため採用 |
| サブタスク 9（Lambda 分割） | `userManagement-lambda.ts` 1 ファイルで 5 ルートをバンドル | ルートごとに独立した `-lambda.ts` を作成（案 A）| `admin-lambda.ts` → 4 ファイル、`userManagement-lambda.ts` → 5 ファイルに分割。CDK も 4 + 5 の個別 Lambda 定義に更新。URL パラメータを持つルート（`:userId`）は `'*'` ではなくフルパスパターンで登録（`c.req.param()` 対応）。`api-architecture.md` に 1 ルート = 1 Lambda 方針を明文化 |
| `createTenant.small.test.ts` バグ修正 | Green | 新ステップ追加後に mock 不足で Red 化 | Step 4/5 の `tenantDb.execute()` と Step 7 の `$returningId()` チェーンに対応する mock を追加 |
