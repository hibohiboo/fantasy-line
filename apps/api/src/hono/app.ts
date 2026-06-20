/**
 * 統合テスト専用の Hono アプリケーション。
 * 本番 Lambda はルートごとに *-lambda.ts を使うこと（CloudWatch ログ分離のため）。
 */
import { Hono } from 'hono';
import type { AppBindings, HonoVariables } from './types';
import { tenantContext } from '../shared/middleware/tenantContext';
import { requirePermission } from '../shared/middleware/requirePermission';
import { listVillagesHandler } from '../village/listVillages';

export const app = new Hono<{ Variables: HonoVariables; Bindings: AppBindings }>();

app.use('*', tenantContext);

app.get('/api/villages', requirePermission('village', 'read'), listVillagesHandler);
