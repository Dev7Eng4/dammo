import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { isAppError } from '../../shared/http/errors.js';
import { createChromeProfileSchema, updateChromeProfileSchema } from './chrome-profiles.schema.js';
import { chromeProfilesService } from './chrome-profiles.service.js';

export function createChromeProfilesRoutes() {
  const app = new Hono();

  app.post('/', zValidator('json', createChromeProfileSchema), async (c) => {
    const body = c.req.valid('json');
    const item = await chromeProfilesService.create(body);
    return c.json({ item }, 201);
  });

  app.get('/', (c) => c.json(chromeProfilesService.list()));

  app.post('/reset-sub-profiles', async (c) => {
    const result = await chromeProfilesService.resetSubProfiles();
    return c.json(result);
  });

  app.patch('/:id', zValidator('json', updateChromeProfileSchema), (c) => {
    const body = c.req.valid('json');
    const item = chromeProfilesService.update(c.req.param('id'), body);
    return c.json({ item });
  });

  app.post('/:id/open', async (c) => {
    const item = await chromeProfilesService.open(c.req.param('id'));
    return c.json({ item });
  });

  app.post('/:id/set-main', async (c) => {
    const item = chromeProfilesService.setAsMain(c.req.param('id'));
    return c.json({ item });
  });

  app.post('/:id/set-sub', async (c) => {
    const item = chromeProfilesService.setAsSub(c.req.param('id'));
    return c.json({ item });
  });

  app.get('/:id', (c) => {
    const item = chromeProfilesService.getById(c.req.param('id'));
    return c.json({ item });
  });

  app.onError((err, c) => {
    if (isAppError(err)) {
      return c.json({ error: err.message, code: err.code }, err.statusCode as 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  });

  return app;
}
