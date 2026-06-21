import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import type { AppBindings, HonoVariables } from '../hono/types';
import { tenantContext } from '../shared/middleware/tenantContext';
import { requirePermission } from '../shared/middleware/requirePermission';
import { listUsersHandler } from './listUsers';
import { inviteUserHandler } from './inviteUser';
import { deleteUserHandler } from './deleteUser';
import { changeUserRoleHandler } from './changeUserRole';
import { resendInvitationHandler } from './resendInvitation';

const app = new Hono<{ Variables: HonoVariables; Bindings: AppBindings }>();
app.use('*', tenantContext);

app.get('/api/users', requirePermission('user', 'list'), listUsersHandler);
app.post('/api/users/invite', requirePermission('user', 'manage'), inviteUserHandler);
app.delete('/api/users/:userId', requirePermission('user', 'manage'), deleteUserHandler);
app.put('/api/users/:userId/roles', requirePermission('user', 'manage'), changeUserRoleHandler);
app.post('/api/users/:userId/resend-invitation', requirePermission('user', 'manage'), resendInvitationHandler);

export const handler = handle(app);
