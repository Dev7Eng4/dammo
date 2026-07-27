import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { isAppError } from '../../shared/http/errors.js';
import { assetKindSchema, deleteAssetsSchema, listAssetsQuerySchema } from './assets.schema.js';
import { assetsService } from './assets.service.js';
import type { AssetKind } from './assets.types.js';

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export function createAssetsRoutes() {
  const app = new Hono();

  app.get('/', zValidator('query', listAssetsQuerySchema), (c) => {
    const { kind } = c.req.valid('query');
    return c.json({ items: assetsService.list(kind) });
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

  app.onError((err, c) => {
    if (isAppError(err)) {
      return c.json({ error: err.message, code: err.code }, err.statusCode as 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  });

  return app;
}
