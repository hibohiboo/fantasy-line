import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import type { AppBindings, HonoVariables } from '../hono/types';
import { tenantContext } from '../shared/middleware/tenantContext';
import { requirePermission } from '../shared/middleware/requirePermission';
import { inviteUserHandler } from './inviteUser';

const app = new Hono<{ Variables: HonoVariables; Bindings: AppBindings }>();
app.use('*', tenantContext);
app.post('*', requirePermission('user', 'manage'), inviteUserHandler);

export const handler = handle(app);
