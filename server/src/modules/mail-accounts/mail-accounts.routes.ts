import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { isAppError } from '../../shared/http/errors.js';
import {
  createMailAccountSchema,
  exportMailAccountsQuerySchema,
  listMailAccountsQuerySchema,
  updateMailAccountSchema,
} from './mail-accounts.schema.js';
import { buildExportFilename, buildMailAccountsExcel } from './mail-accounts.exporter.js';
import { mailAccountsService } from './mail-accounts.service.js';

export function createMailAccountsRoutes() {
  const app = new Hono();

  app.get('/export', zValidator('query', exportMailAccountsQuerySchema), (c) => {
    const { q, ids } = c.req.valid('query');
    const idList = ids ? ids.split(',').filter(Boolean) : undefined;
    const buffer = buildMailAccountsExcel(q, idList);
    const filename = buildExportFilename(idList);

    c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    return c.newResponse(new Uint8Array(buffer), 200);
  });

  app.get('/', zValidator('query', listMailAccountsQuerySchema), (c) => {
    const { q, page, limit } = c.req.valid('query');
    const result = mailAccountsService.listPaginated(q, page, limit);
    return c.json(result);
  });

  app.get('/:id', (c) => {
    const account = mailAccountsService.getById(c.req.param('id'));
    return c.json(account);
  });

  app.post('/', zValidator('json', createMailAccountSchema), (c) => {
    const body = c.req.valid('json');
    const item = mailAccountsService.create(body);
    return c.json({ item }, 201);
  });

  app.patch('/:id', zValidator('json', updateMailAccountSchema), (c) => {
    const body = c.req.valid('json');
    const item = mailAccountsService.update(c.req.param('id'), body);
    return c.json({ item });
  });

  app.delete('/:id', (c) => {
    mailAccountsService.delete(c.req.param('id'));
    return c.body(null, 204);
  });

  app.onError((err, c) => {
    if (isAppError(err)) {
      return c.json({ error: err.message, code: err.code }, err.statusCode as 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  });

  return app;
}
