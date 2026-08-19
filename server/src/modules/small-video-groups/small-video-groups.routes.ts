import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { isAppError } from '../../shared/http/errors.js';
import {
  createSmallVideoGroupSchema,
  deleteSmallVideoGroupMediaSchema,
} from './small-video-groups.schema.js';
import { smallVideoGroupsService } from './small-video-groups.service.js';

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

function streamMediaFile(
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

export function createSmallVideoGroupsRoutes() {
  const app = new Hono();

  app.get('/', (c) => c.json({ items: smallVideoGroupsService.list() }));

  app.post('/', zValidator('json', createSmallVideoGroupSchema), (c) => {
    const body = c.req.valid('json');
    const item = smallVideoGroupsService.create(body);
    return c.json({ item }, 201);
  });

  app.get('/:id/media', (c) => {
    const items = smallVideoGroupsService.listMedia(c.req.param('id'));
    return c.json({ items });
  });

  app.post('/:id/media', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) {
      return c.json({ error: 'File is required' }, 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return c.json({ error: 'File must not exceed 500 MB' }, 400);
    }
    const item = await smallVideoGroupsService.uploadMedia(id, file);
    return c.json({ item }, 201);
  });

  app.get('/:id/media/:filename', (c) => {
    const asset = smallVideoGroupsService.getMediaFile(c.req.param('id'), c.req.param('filename'));
    return streamMediaFile(c.req.raw, asset);
  });

  app.delete('/:id/media', zValidator('json', deleteSmallVideoGroupMediaSchema), (c) => {
    const body = c.req.valid('json');
    const result = smallVideoGroupsService.deleteMedia(c.req.param('id'), body.names);
    return c.json(result);
  });

  app.get('/:id', (c) => {
    const item = smallVideoGroupsService.getById(c.req.param('id'));
    return c.json({ item });
  });

  app.delete('/:id', (c) => {
    smallVideoGroupsService.delete(c.req.param('id'));
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
