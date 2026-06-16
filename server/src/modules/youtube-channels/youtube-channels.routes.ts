import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { isAppError } from '../../shared/http/errors.js';
import {
  createYoutubeChannelSchema,
  listYoutubeChannelsQuerySchema,
} from './youtube-channels.schema.js';
import { youtubeChannelsService } from './youtube-channels.service.js';

export function createYoutubeChannelsRoutes() {
  const app = new Hono();

  app.get('/stats', (c) => c.json(youtubeChannelsService.getStats()));

  app.post('/', zValidator('json', createYoutubeChannelSchema), async (c) => {
    const body = c.req.valid('json');
    const item = await youtubeChannelsService.create(body);
    return c.json({ item }, 201);
  });

  app.get('/', zValidator('query', listYoutubeChannelsQuerySchema), (c) => {
    const { type, monetization, q, page, limit } = c.req.valid('query');
    return c.json(youtubeChannelsService.listPaginated(type, monetization, q, page, limit));
  });

  app.get('/:id', (c) => c.json(youtubeChannelsService.getById(c.req.param('id'))));

  app.onError((err, c) => {
    if (isAppError(err)) {
      return c.json({ error: err.message, code: err.code }, err.statusCode as 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  });

  return app;
}
