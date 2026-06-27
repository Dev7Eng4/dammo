import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { isAppError } from '../../shared/http/errors.js';
import {
  createGpmGroupSchema,
  createGpmProfileSchema,
  deleteGpmProfileQuerySchema,
  gpmListQuerySchema,
  gpmTestProfileSchema,
  startGpmProfileSchema,
  updateGpmGroupSchema,
  updateGpmProfileSchema,
} from './gpm-manager.schema.js';
import { gpmLlmTestService } from './gpm-llm-test.service.js';
import { gpmManagerService } from './gpm-manager.service.js';

export function createGpmManagerRoutes() {
  const app = new Hono();

  app.get('/status', async (c) => {
    const item = await gpmManagerService.getStatus();
    return c.json({ item });
  });

  app.get('/profiles', zValidator('query', gpmListQuerySchema), async (c) => {
    const query = c.req.valid('query');
    const item = await gpmManagerService.listProfiles(query);
    return c.json({ item });
  });

  app.get('/profiles/:id', async (c) => {
    const item = await gpmManagerService.getProfile(c.req.param('id'));
    return c.json({ item });
  });

  app.post('/profiles', zValidator('json', createGpmProfileSchema), async (c) => {
    const body = c.req.valid('json');
    const item = await gpmManagerService.createProfile(body);
    return c.json({ item }, 201);
  });

  app.patch('/profiles/:id', zValidator('json', updateGpmProfileSchema), async (c) => {
    const body = c.req.valid('json');
    const item = await gpmManagerService.updateProfile(c.req.param('id'), body);
    return c.json({ item });
  });

  app.delete('/profiles/:id', zValidator('query', deleteGpmProfileQuerySchema), async (c) => {
    const { mode } = c.req.valid('query');
    await gpmManagerService.deleteProfile(c.req.param('id'), mode);
    return c.json({ ok: true });
  });

  app.post('/profiles/:id/start', zValidator('json', startGpmProfileSchema), async (c) => {
    const body = c.req.valid('json');
    const item = await gpmManagerService.startProfile(c.req.param('id'), body);
    return c.json({ item });
  });

  app.post('/profiles/:id/stop', async (c) => {
    await gpmManagerService.stopProfile(c.req.param('id'));
    return c.json({ ok: true });
  });

  app.post('/profiles/:id/test', zValidator('json', gpmTestProfileSchema), async (c) => {
    const item = await gpmLlmTestService.testGemini(c.req.param('id'));
    return c.json({ item });
  });

  app.get('/groups', zValidator('query', gpmListQuerySchema), async (c) => {
    const query = c.req.valid('query');
    const item = await gpmManagerService.listGroups(query);
    return c.json({ item });
  });

  app.post('/groups', zValidator('json', createGpmGroupSchema), async (c) => {
    const body = c.req.valid('json');
    const item = await gpmManagerService.createGroup(body);
    return c.json({ item }, 201);
  });

  app.patch('/groups/:id', zValidator('json', updateGpmGroupSchema), async (c) => {
    const body = c.req.valid('json');
    const item = await gpmManagerService.updateGroup(c.req.param('id'), body);
    return c.json({ item });
  });

  app.delete('/groups/:id', async (c) => {
    await gpmManagerService.deleteGroup(c.req.param('id'));
    return c.json({ ok: true });
  });

  app.onError((err, c) => {
    if (isAppError(err)) {
      const status = err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 502;
      return c.json({ error: err.message, code: err.code }, status as 400);
    }
    console.error('[gpm-manager]', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message }, 500);
  });

  return app;
}
