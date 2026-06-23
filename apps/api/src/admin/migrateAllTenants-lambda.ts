import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import type { AppBindings } from '../hono/types';
import { adminContext, type AdminVariables } from './adminContext';
import { migrateAllTenantsHandler } from './migrateAllTenants';

const app = new Hono<{ Variables: AdminVariables; Bindings: AppBindings }>();
app.use('*', adminContext);
app.post('*', migrateAllTenantsHandler);

export const handler = handle(app);
