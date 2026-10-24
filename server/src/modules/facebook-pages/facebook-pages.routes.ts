import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { isAppError } from '../../shared/http/errors.js';
import { facebookAutomationService } from '../facebook-automation/facebook-automation.service.js';
import {
  createFacebookPageSchema,
  listFacebookPagesQuerySchema,
  postToFacebookPageSchema,
  updateFacebookPageSchema,
  uploadFacebookVideoSchema,
} from './facebook-pages.schema.js';
import { facebookPagesService } from './facebook-pages.service.js';

export function createFacebookPagesRoutes() {
  const app = new Hono();

  app.get('/', zValidator('query', listFacebookPagesQuerySchema), (c) => {
    const items = facebookPagesService.list(c.req.valid('query'));
    return c.json({ items, total: items.length });
  });

  app.get('/stats', (c) => c.json(facebookPagesService.stats()));

  app.get('/:id', (c) => c.json({ item: facebookPagesService.get(c.req.param('id')) }));

  app.post('/', zValidator('json', createFacebookPageSchema), (c) => {
    const item = facebookPagesService.create(c.req.valid('json'));
    return c.json({ item }, 201);
  });

  app.patch('/:id', zValidator('json', updateFacebookPageSchema), (c) => {
    const item = facebookPagesService.update(c.req.param('id'), c.req.valid('json'));
    return c.json({ item });
  });

  app.delete('/:id', (c) => {
    facebookPagesService.remove(c.req.param('id'));
    return c.json({ ok: true });
  });

  app.post('/:id/create-on-facebook', async (c) => {
    const item = await facebookAutomationService.createOnFacebook(c.req.param('id'));
    return c.json({ item });
  });

  app.post('/:id/post', zValidator('json', postToFacebookPageSchema), async (c) => {
    const item = await facebookAutomationService.post(c.req.param('id'), c.req.valid('json'));
    return c.json({ item });
  });

  app.post('/:id/upload-video', zValidator('json', uploadFacebookVideoSchema), async (c) => {
    const item = await facebookAutomationService.uploadVideo(c.req.param('id'), c.req.valid('json'));
    return c.json({ item });
  });

  app.post('/:id/probe-selectors', async (c) => {
    const results = await facebookAutomationService.probe(c.req.param('id'));
    return c.json({ results });
  });

  app.onError((err, c) => {
    if (isAppError(err)) {
      return c.json({ error: err.message, code: err.code }, err.statusCode as 400);
    }
    console.error(err);
    return c.json({ error: 'Internal server error' }, 500);
  });

  return app;
}
