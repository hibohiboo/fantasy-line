import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import type { AppBindings } from '../hono/types';
import { adminContext, type AdminVariables } from './adminContext';
import { createServicerDelegateHandler } from './createServicerDelegate';

const app = new Hono<{ Variables: AdminVariables; Bindings: AppBindings }>();
app.use('*', adminContext);
app.post('*', createServicerDelegateHandler);

export const handler = handle(app);
