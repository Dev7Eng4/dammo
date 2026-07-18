import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { isAppError } from '../../shared/http/errors.js';
import { createNicheSchema } from './niches.schema.js';
import { nichesService } from './niches.service.js';

export function createNichesRoutes() {
  const app = new Hono();

  app.get('/', (c) => c.json({ items: nichesService.list() }));

  app.post('/', zValidator('json', createNicheSchema), (c) => {
    const body = c.req.valid('json');
    const item = nichesService.create(body);
    return c.json({ item }, 201);
  });

  app.onError((err, c) => {
    if (isAppError(err)) {
      return c.json({ error: err.message, code: err.code }, err.statusCode as 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  });

  return app;
}
