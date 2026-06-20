import { Hono } from 'hono';
import type { HonoVariables } from './types';
import { tenantContext } from '../shared/middleware/tenantContext';
import { requirePermission } from '../shared/middleware/requirePermission';
import { listVillagesHandler } from '../village/listVillages';

type AppBindings = {
  event: {
    requestContext: {
      authorizer: {
        jwt: {
          claims: Record<string, string>;
        };
      };
    };
    headers?: Record<string, string>;
  };
};

export const app = new Hono<{ Variables: HonoVariables; Bindings: AppBindings }>();

app.use('*', tenantContext);

app.get('/api/villages', requirePermission('village', 'read'), listVillagesHandler);
