import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { isAppError } from '../../shared/http/errors.js';
import {
  downloadYoutubeTranscriptSchema,
  downloadYoutubeUrlSchema,
} from './content-download.schema.js';
import { contentDownloadService } from './content-download.service.js';

export function createContentDownloadRoutes() {
  const app = new Hono();

  app.post('/youtube/video', zValidator('json', downloadYoutubeUrlSchema), async (c) => {
    const body = c.req.valid('json');
    const item = await contentDownloadService.downloadYoutubeVideo(body);
    return c.json({ item });
  });

  app.post('/youtube/audio', zValidator('json', downloadYoutubeUrlSchema), async (c) => {
    const body = c.req.valid('json');
    const item = await contentDownloadService.downloadYoutubeAudio(body);
    return c.json({ item });
  });

  app.post('/youtube/transcript', zValidator('json', downloadYoutubeTranscriptSchema), async (c) => {
    const body = c.req.valid('json');
    const item = await contentDownloadService.downloadYoutubeTranscript(body);
    return c.json({ item });
  });

  app.post('/youtube/thumbnail', zValidator('json', downloadYoutubeUrlSchema), async (c) => {
    const body = c.req.valid('json');
    const item = await contentDownloadService.downloadYoutubeThumbnail(body);
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
