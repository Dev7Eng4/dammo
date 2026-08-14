import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { isAppError } from '../../shared/http/errors.js';
import {
  createSourceChannelSchema,
  listSourceChannelsQuerySchema,
  sourceChannelVideosQuerySchema,
  updateSourceChannelSchema,
} from './source-channels.schema.js';
import { sourceChannelsService } from './source-channels.service.js';

export function createSourceChannelsRoutes() {
  const app = new Hono();

  app.post('/', zValidator('json', createSourceChannelSchema), async (c) => {
    const body = c.req.valid('json');
    const item = await sourceChannelsService.create(body);
    return c.json({ item }, 201);
  });

  app.get('/', zValidator('query', listSourceChannelsQuerySchema), (c) => {
    const { platform, purpose, language, risk, q, page, limit } = c.req.valid('query');
    return c.json(
      sourceChannelsService.listPaginated(platform, purpose, language, risk, q, page, limit),
    );
  });

  app.post('/:id/refresh', async (c) => {
    const result = await sourceChannelsService.refresh(c.req.param('id'));
    return c.json(result);
  });

  app.get('/:id/videos', zValidator('query', sourceChannelVideosQuerySchema), (c) => {
    const { page, limit, duration } = c.req.valid('query');
    const result = sourceChannelsService.getVideos(c.req.param('id'), page, limit, duration);
    return c.json(result);
  });

  app.get('/:id/usage', (c) => c.json(sourceChannelsService.getUsage(c.req.param('id'))));

  app.patch('/:id', zValidator('json', updateSourceChannelSchema), (c) => {
    const body = c.req.valid('json');
    const item = sourceChannelsService.update(c.req.param('id'), body);
    return c.json({ item });
  });

  app.delete('/:id', (c) => {
    sourceChannelsService.delete(c.req.param('id'));
    return c.body(null, 204);
  });

  app.get('/:id', (c) => c.json(sourceChannelsService.getById(c.req.param('id'))));

  app.onError((err, c) => {
    if (isAppError(err)) {
      return c.json({ error: err.message, code: err.code }, err.statusCode as 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  });

  return app;
}
