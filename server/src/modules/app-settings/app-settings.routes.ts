import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { applyChromeBackgroundModeToOpenProfiles } from '../chrome-profiles/chrome-profile.runner.js';
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
    const previous = appSettingsService.get();
    const item = appSettingsService.update(body);

    if (previous.chromeBackgroundUseOffscreen !== item.chromeBackgroundUseOffscreen) {
      void applyChromeBackgroundModeToOpenProfiles().catch(() => undefined);
    }

    return c.json({ item });
  });

  return app;
}
