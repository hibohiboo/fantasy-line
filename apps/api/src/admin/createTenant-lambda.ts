import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import type { AppBindings } from '../hono/types';
import { adminContext, type AdminVariables } from './adminContext';
import { createTenantHandler } from './createTenant';

const app = new Hono<{ Variables: AdminVariables; Bindings: AppBindings }>();
app.use('*', adminContext);
app.post('*', createTenantHandler);

export const handler = handle(app);
