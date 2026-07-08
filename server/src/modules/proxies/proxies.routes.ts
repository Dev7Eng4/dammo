import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { Buffer } from 'node:buffer';
import { parseExcelBuffer } from '../../infrastructure/storage/excel-store.js';
import { isAppError } from '../../shared/http/errors.js';
import { buildExportFilename, buildProxiesExcel } from './proxies.exporter.js';
import {
  assignProfileSchema,
  createProxySchema,
  exportProxiesQuerySchema,
  listProxiesQuerySchema,
  updateProxySchema,
} from './proxies.schema.js';
import { proxiesService } from './proxies.service.js';
import {
  createProxyProviderSchema,
  updateProxyProviderSchema,
} from './proxy-providers.schema.js';
import { proxyProvidersService } from './proxy-providers.service.js';
import { seedProxiesIfEmpty } from './proxies.seed.js';

import type { ProxyStatus } from './proxies.types.js';

seedProxiesIfEmpty();

export function createProxiesRoutes() {
  const app = new Hono();

  app.get('/stats', (c) => c.json(proxiesService.getStats()));

  app.get('/export', zValidator('query', exportProxiesQuerySchema), (c) => {
    const { status, q, ids } = c.req.valid('query');
    const idList = ids ? ids.split(',').filter(Boolean) : undefined;
    const buffer = buildProxiesExcel(status, q, idList);
    const filename = buildExportFilename(idList);

    c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    return c.newResponse(new Uint8Array(buffer), 200);
  });

  app.post('/import', async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) {
      return c.json({ error: 'File is required' }, 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const rows = parseExcelBuffer<Record<string, unknown>>(buffer);
    const result = proxiesService.importRows(rows);
    return c.json(result);
  });

  app.delete('/bulk/failed', (c) => {
    const removed = proxiesService.archiveFailed();
    return c.json({ removed });
  });

  app.get('/providers', (c) => c.json({ items: proxyProvidersService.list() }));

  app.get('/providers/:id', (c) => {
    const item = proxyProvidersService.getById(c.req.param('id'));
    return c.json(item);
  });

  app.post('/providers', zValidator('json', createProxyProviderSchema), (c) => {
    const body = c.req.valid('json');
    const item = proxyProvidersService.create(body);
    return c.json({ item }, 201);
  });

  app.patch('/providers/:id', zValidator('json', updateProxyProviderSchema), (c) => {
    const body = c.req.valid('json');
    const item = proxyProvidersService.update(c.req.param('id'), body);
    return c.json({ item });
  });

  app.delete('/providers/:id', (c) => {
    proxyProvidersService.delete(c.req.param('id'));
    return c.json({ ok: true });
  });

  app.get('/', zValidator('query', listProxiesQuerySchema), (c) => {
    const { status, q, page, limit } = c.req.valid('query');
    const result = proxiesService.listPaginated(status as ProxyStatus | undefined, q, page, limit);
    return c.json(result);
  });

  app.post('/assign', zValidator('json', assignProfileSchema), (c) => {
    const { profileId, proxyId } = c.req.valid('json');
    proxiesService.setProfileAssignment(profileId, proxyId);
    return c.json({ ok: true });
  });

  app.get('/:id', (c) => {
    const proxy = proxiesService.getById(c.req.param('id'));
    return c.json(proxy);
  });

  app.post('/', zValidator('json', createProxySchema), (c) => {
    const body = c.req.valid('json');
    const item = proxiesService.create(body);
    return c.json({ item }, 201);
  });

  app.patch('/:id', zValidator('json', updateProxySchema), (c) => {
    const body = c.req.valid('json');
    const item = proxiesService.update(c.req.param('id'), body);
    return c.json({ item });
  });

  app.delete('/:id', (c) => {
    proxiesService.archive(c.req.param('id'));
    return c.json({ ok: true });
  });

  app.post('/:id/test', async (c) => {
    const result = await proxiesService.test(c.req.param('id'));
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
