import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { isAppError } from '../../shared/http/errors.js';
import { assetKindSchema, deleteAssetsSchema, listAssetsQuerySchema } from './assets.schema.js';
import { assetsService } from './assets.service.js';
import type { AssetKind } from './assets.types.js';
import { prepareColorAsset, type PrepareColorKind } from '../video-production/shared/si-video/si-prepare-color-cache.js';

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

function streamAssetFile(
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

export function createAssetsRoutes() {
  const app = new Hono();

  app.get('/', zValidator('query', listAssetsQuerySchema), async (c) => {
    const { kind } = c.req.valid('query');
    const items = await assetsService.list(kind);
    return c.json({ items });
  });

  app.get('/:kind/:filename', (c) => {
    const kindParsed = assetKindSchema.safeParse(c.req.param('kind'));
    if (!kindParsed.success) {
      return c.json({ error: 'Invalid asset kind' }, 400);
    }
    const asset = assetsService.getAsset(kindParsed.data as AssetKind, c.req.param('filename'));
    return streamAssetFile(c.req.raw, asset);
  });

  app.post('/:kind', async (c) => {
    const kindParsed = assetKindSchema.safeParse(c.req.param('kind'));
    if (!kindParsed.success) {
      return c.json({ error: 'Invalid asset kind' }, 400);
    }
    const kind = kindParsed.data as AssetKind;

    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) {
      return c.json({ error: 'File is required' }, 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return c.json({ error: 'File must not exceed 500 MB' }, 400);
    }

    const item = await assetsService.upload(kind, file);
    return c.json({ item }, 201);
  });

  app.delete('/:kind', zValidator('json', deleteAssetsSchema), (c) => {
    const kindParsed = assetKindSchema.safeParse(c.req.param('kind'));
    if (!kindParsed.success) {
      return c.json({ error: 'Invalid asset kind' }, 400);
    }
    const body = c.req.valid('json');
    const result = assetsService.delete(kindParsed.data, body.names);
    return c.json(result);
  });

  app.post('/:kind/:filename/prepare-color', async (c) => {
    const kindParsed = assetKindSchema.safeParse(c.req.param('kind'));
    if (!kindParsed.success) {
      return c.json({ error: 'Invalid asset kind' }, 400);
    }
    const kind = kindParsed.data as AssetKind;
    if (kind !== 'audioBar' && kind !== 'subscribe') {
      return c.json({ error: 'Prepare color is only supported for audioBar and subscribe' }, 400);
    }
    const filename = c.req.param('filename');
    if (!filename?.trim()) {
      return c.json({ error: 'Filename is required' }, 400);
    }
    const result = await prepareColorAsset(kind as PrepareColorKind, filename);
    return c.json({ prepared: true, cached: result.cached });
  });

  app.onError((err, c) => {
    if (isAppError(err)) {
      return c.json({ error: err.message, code: err.code }, err.statusCode as 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  });

  return app;
}
