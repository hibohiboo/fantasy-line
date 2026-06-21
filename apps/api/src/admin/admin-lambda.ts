import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import type { AppBindings } from '../hono/types';
import { adminContext, type AdminVariables } from './adminContext';
import { setupServiceSchemaHandler } from './setupServiceSchema';
import { createTenantHandler } from './createTenant';
import { migrateAllTenantsHandler } from './migrateAllTenants';
import { createServicerDelegateHandler } from './createServicerDelegate';

const app = new Hono<{ Variables: AdminVariables; Bindings: AppBindings }>();

app.use('*', adminContext);

app.post('/admin/setup/service-schema', setupServiceSchemaHandler);
app.post('/admin/tenants', createTenantHandler);
app.post('/admin/migrate/all-tenants', migrateAllTenantsHandler);
app.post('/admin/users', createServicerDelegateHandler);

export const handler = handle(app);
