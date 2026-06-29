import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { isAppError } from '../../shared/http/errors.js';
import { createVisualStyleSchema, updateVisualStyleSchema } from './visual-styles.schema.js';
import { visualStylesService } from './visual-styles.service.js';

export function createVisualStylesRoutes() {
  const app = new Hono();

  app.get('/', (c) => c.json({ items: visualStylesService.list() }));

  app.get('/:id', (c) => {
    const item = visualStylesService.getById(c.req.param('id'));
    return c.json({ item });
  });

  app.post('/', zValidator('json', createVisualStyleSchema), (c) => {
    const body = c.req.valid('json');
    const item = visualStylesService.create(body);
    return c.json({ item }, 201);
  });

  app.patch('/:id', zValidator('json', updateVisualStyleSchema), (c) => {
    const body = c.req.valid('json');
    const item = visualStylesService.update(c.req.param('id'), body);
    return c.json({ item });
  });

  app.delete('/:id', (c) => {
    visualStylesService.delete(c.req.param('id'));
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
