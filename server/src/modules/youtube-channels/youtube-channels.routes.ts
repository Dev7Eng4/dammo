import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { isAppError } from '../../shared/http/errors.js';
import {
  createVideosBatchSchema,
  createYoutubeChannelSchema,
  listYoutubeChannelsQuerySchema,
  updateYoutubeChannelSchema,
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

  app.patch('/:id', zValidator('json', updateYoutubeChannelSchema), (c) => {
    const body = c.req.valid('json');
    const item = youtubeChannelsService.update(c.req.param('id'), body);
    return c.json({ item });
  });

  app.get('/', zValidator('query', listYoutubeChannelsQuerySchema), (c) => {
    const { type, monetization, q, page, limit } = c.req.valid('query');
    return c.json(youtubeChannelsService.listPaginated(type, monetization, q, page, limit));
  });

  app.get('/:id/videos/:videoId/comments', async (c) => {
    const result = await youtubeChannelsService.getVideoComments(
      c.req.param('id'),
      c.req.param('videoId'),
    );
    return c.json(result);
  });

  app.get('/:id/videos', async (c) => {
    const result = await youtubeChannelsService.getVideos(c.req.param('id'));
    return c.json(result);
  });

  app.post('/create-videos', async (c) => {
    const contentType = c.req.header('content-type') ?? '';
    let channelIds: string[] | undefined;

    if (contentType.includes('application/json')) {
      const parsed = createVideosBatchSchema.safeParse(await c.req.json());
      if (!parsed.success) {
        return c.json({ error: parsed.error.message }, 400);
      }
      channelIds = parsed.data.channelIds;
    }

    const result = channelIds?.length
      ? await youtubeChannelsService.createVideosForChannels(channelIds)
      : await youtubeChannelsService.createVideosForAllReupChannels();
    return c.json(result);
  });

  app.post('/:id/create-videos', async (c) => {
    const result = await youtubeChannelsService.createVideos(c.req.param('id'));
    return c.json(result);
  });

  app.post('/:id/sync-videos', async (c) => {
    const result = await youtubeChannelsService.syncVideos(c.req.param('id'));
    return c.json(result);
  });

  // Detail page: return stored channel metadata (refresh via POST /:id/sync-videos)
  app.get('/:id', (c) => {
    const item = youtubeChannelsService.getById(c.req.param('id'));
    return c.json(item);
  });

  app.onError((err, c) => {
    if (isAppError(err)) {
      return c.json({ error: err.message, code: err.code }, err.statusCode as 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  });

  return app;
}
