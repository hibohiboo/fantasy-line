/**
 * 統合テスト専用の Hono アプリケーション。
 * 本番 Lambda はルートごとに *-lambda.ts を使うこと（CloudWatch ログ分離のため）。
 */
import { Hono } from 'hono';
import type { AppBindings, HonoVariables } from './types';
import { tenantContext } from '../shared/middleware/tenantContext';
import { requirePermission } from '../shared/middleware/requirePermission';
import { listVillagesHandler } from '../village/listVillages';
import { createVillageHandler } from '../village/createVillage';
import { createResidentHandler } from '../resident/createResident';
import { listResidentsHandler } from '../resident/listResidents';
import { listVillageResidentsHandler } from '../resident/listVillageResidents';

export const app = new Hono<{ Variables: HonoVariables; Bindings: AppBindings }>();

app.use('*', tenantContext);

app.get('/api/villages', requirePermission('village', 'read'), listVillagesHandler);
app.post('/api/villages', requirePermission('village', 'create'), createVillageHandler);

app.post('/api/residents', requirePermission('resident', 'create'), createResidentHandler);
app.get('/api/residents', requirePermission('resident', 'read'), listResidentsHandler);
app.get('/api/villages/:id/residents', requirePermission('resident', 'read'), listVillageResidentsHandler);
