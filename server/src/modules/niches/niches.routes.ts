import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { isAppError } from '../../shared/http/errors.js';
import { createNicheSchema, updateNicheSchema } from './niches.schema.js';
import { nichesService } from './niches.service.js';

export function createNichesRoutes() {
  const app = new Hono();

  app.get('/', (c) => c.json({ items: nichesService.list() }));

  app.post('/', zValidator('json', createNicheSchema), (c) => {
    const body = c.req.valid('json');
    const item = nichesService.create(body);
    return c.json({ item }, 201);
  });

  app.get('/:key/usage', (c) => {
    const usage = nichesService.getUsage(c.req.param('key'));
    return c.json({ usage });
  });

  app.patch('/:key', zValidator('json', updateNicheSchema), (c) => {
    const body = c.req.valid('json');
    const item = nichesService.update(c.req.param('key'), body);
    return c.json({ item });
  });

  app.delete('/:key', (c) => {
    nichesService.delete(c.req.param('key'));
    return c.json({ ok: true });
  });

  app.onError((err, c) => {
    if (isAppError(err)) {
      return c.json({ error: err.message, code: err.code }, err.statusCode as 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  });

  return app;
}
