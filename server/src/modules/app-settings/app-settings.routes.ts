import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { updateAppSettingsSchema } from './app-settings.schema.js';
import { appSettingsService } from './app-settings.service.js';

export function createAppSettingsRoutes() {
  const app = new Hono();

  app.get('/', (c) => {
    const item = appSettingsService.get();
    return c.json({ item });
  });

  app.patch('/', zValidator('json', updateAppSettingsSchema), (c) => {
    const body = c.req.valid('json');
    const item = appSettingsService.update(body);
    return c.json({ item });
  });

  return app;
}
