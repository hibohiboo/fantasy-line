import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import type { AppBindings, HonoVariables } from '../hono/types';
import { tenantContext } from '../shared/middleware/tenantContext';
import { requirePermission } from '../shared/middleware/requirePermission';
import { changeUserRoleHandler } from './changeUserRole';

const app = new Hono<{ Variables: HonoVariables; Bindings: AppBindings }>();
app.use('*', tenantContext);
app.put('/api/users/:userId/roles', requirePermission('user', 'manage'), changeUserRoleHandler);

export const handler = handle(app);
