import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import type { AppBindings } from '../hono/types';
import { adminContext, type AdminVariables } from './adminContext';
import { setupServiceSchemaHandler } from './setupServiceSchema';

const app = new Hono<{ Variables: AdminVariables; Bindings: AppBindings }>();
app.use('*', adminContext);
app.post('*', setupServiceSchemaHandler);

export const handler = handle(app);
