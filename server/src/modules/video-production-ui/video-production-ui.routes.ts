import { Hono } from 'hono';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { isAppError } from '../../shared/http/errors.js';
import { videoProductionUiService } from './video-production-ui.service.js';

function streamFileAsset(
  request: Request,
  asset: { filePath: string; contentType: string; size: number },
): Response {
  const range = request.headers.get('range');
  const commonHeaders = {
    'Accept-Ranges': 'bytes',
    'Content-Type': asset.contentType,
    'Cache-Control': 'private, no-cache',
  };

  if (!range) {
    const body = Readable.toWeb(fs.createReadStream(asset.filePath));
    return new Response(body as ReadableStream, {
      status: 200,
      headers: { ...commonHeaders, 'Content-Length': String(asset.size) },
    });
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  const start = match?.[1] ? Number(match[1]) : 0;
  const requestedEnd = match?.[2] ? Number(match[2]) : asset.size - 1;
  const end = Math.min(requestedEnd, asset.size - 1);

  if (!match || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end) {
    return new Response(null, {
      status: 416,
      headers: { ...commonHeaders, 'Content-Range': `bytes */${asset.size}` },
    });
  }

  const body = Readable.toWeb(fs.createReadStream(asset.filePath, { start, end }));
  return new Response(body as ReadableStream, {
    status: 206,
    headers: {
      ...commonHeaders,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${asset.size}`,
    },
  });
}

export function createVideoProductionUiRoutes() {
  const app = new Hono();

  app.get('/videos', (c) => {
    const basePath = c.req.path;
    return c.json({ items: videoProductionUiService.listVideos(basePath) });
  });

  app.get('/videos/:channelId/:videoId/thumbnail', (c) => {
    const asset = videoProductionUiService.getThumbnail(
      c.req.param('channelId'),
      c.req.param('videoId'),
    );
    return streamFileAsset(c.req.raw, asset);
  });

  app.get('/videos/:channelId/:videoId/metadata', (c) => {
    const videoBasePath = c.req.path.replace(/\/metadata$/, '');
    const result = videoProductionUiService.getMetadata(
      c.req.param('channelId'),
      c.req.param('videoId'),
      videoBasePath,
    );
    return c.json(result);
  });

  app.get('/videos/:channelId/:videoId/scenes', (c) => {
    const channelId = c.req.param('channelId');
    const videoId = c.req.param('videoId');
    const basePath = c.req.path;
    const result = videoProductionUiService.getScenes(channelId, videoId, basePath);
    return c.json(result);
  });

  app.get('/videos/:channelId/:videoId/scenes/:sceneIndex/image', (c) => {
    const sceneIndex = Number(c.req.param('sceneIndex'));
    const asset = videoProductionUiService.getSceneImage(
      c.req.param('channelId'),
      c.req.param('videoId'),
      sceneIndex,
    );
    return streamFileAsset(c.req.raw, asset);
  });

  app.post('/videos/:channelId/:videoId/scenes/:sceneIndex/regenerate', async (c) => {
    const sceneIndex = Number(c.req.param('sceneIndex'));
    const result = await videoProductionUiService.regenerateSceneImage(
      c.req.param('channelId'),
      c.req.param('videoId'),
      sceneIndex,
      c.req.path,
    );
    return c.json(result);
  });

  app.get('/videos/:channelId/:videoId/transcript', (c) => {
    const result = videoProductionUiService.getTranscript(
      c.req.param('channelId'),
      c.req.param('videoId'),
    );
    return c.json(result);
  });

  app.get('/videos/:channelId/:videoId/characters', (c) => {
    const channelId = c.req.param('channelId');
    const videoId = c.req.param('videoId');
    const basePath = c.req.path;
    const result = videoProductionUiService.getCharacters(channelId, videoId, basePath);
    return c.json(result);
  });

  app.get('/videos/:channelId/:videoId/characters/:characterId/image', (c) => {
    const asset = videoProductionUiService.getCharacterImage(
      c.req.param('channelId'),
      c.req.param('videoId'),
      c.req.param('characterId'),
    );
    return streamFileAsset(c.req.raw, asset);
  });

  app.onError((err, c) => {
    if (isAppError(err)) {
      return c.json({ error: err.message, code: err.code }, err.statusCode as 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  });

  return app;
}
