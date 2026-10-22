import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { isAppError } from '../../shared/http/errors.js';
import { createMascotSchema, updateMascotSchema } from './mascots.schema.js';
import { mascotsService } from './mascots.service.js';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export function createMascotsRoutes() {
  const app = new Hono();

  app.get('/', (c) => c.json({ items: mascotsService.list() }));

  app.post('/', zValidator('json', createMascotSchema), (c) => {
    const item = mascotsService.create(c.req.valid('json'));
    return c.json({ item }, 201);
  });

  app.get('/:id/image', (c) => {
    const asset = mascotsService.getImageFile(c.req.param('id'));
    const body = Readable.toWeb(fs.createReadStream(asset.filePath));
    return new Response(body as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': asset.contentType,
        'Content-Length': String(asset.size),
        'Cache-Control': 'private, no-cache',
      },
    });
  });

  app.post('/:id/image', async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) {
      return c.json({ error: 'File is required' }, 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return c.json({ error: 'File must not exceed 20 MB' }, 400);
    }
    const item = await mascotsService.uploadImage(c.req.param('id'), file);
    return c.json({ item });
  });

  app.delete('/:id/image', (c) => {
    const item = mascotsService.deleteImage(c.req.param('id'));
    return c.json({ item });
  });

  app.patch('/:id', zValidator('json', updateMascotSchema), (c) => {
    const item = mascotsService.update(c.req.param('id'), c.req.valid('json'));
    return c.json({ item });
  });

  app.delete('/:id', (c) => {
    mascotsService.delete(c.req.param('id'));
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
