import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import type { AppBindings, HonoVariables } from '../hono/types';
import { tenantContext } from '../shared/middleware/tenantContext';
import { requirePermission } from '../shared/middleware/requirePermission';
import { deleteUserHandler } from './deleteUser';

const app = new Hono<{ Variables: HonoVariables; Bindings: AppBindings }>();
app.use('*', tenantContext);
app.delete('/api/users/:userId', requirePermission('user', 'manage'), deleteUserHandler);

export const handler = handle(app);
