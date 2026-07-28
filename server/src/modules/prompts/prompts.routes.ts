import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { isAppError } from '../../shared/http/errors.js';
import {
  createPromptSetSchema,
  listPromptsQuerySchema,
  promptKeyQuerySchema,
  promptSetOptionsQuerySchema,
  thumbnailStylesQuerySchema,
  updatePromptSetSchema,
} from './prompts.schema.js';
import { promptsService } from './prompts.service.js';
import { listThumbnailStyleOptions } from './thumbnail-styles.js';
import { promptPlaygroundRunSchema } from '../prompt-playground/prompt-playground.schema.js';
import { promptPlaygroundService } from '../prompt-playground/prompt-playground.service.js';
import { updatePromptsSettingsSchema } from './prompts-settings.schema.js';
import { promptsSettingsService } from './prompts-settings.service.js';

export function createPromptsRoutes() {
  const app = new Hono();

  app.get('/', zValidator('query', listPromptsQuerySchema), (c) => {
    const { category, language, q, page, limit } = c.req.valid('query');
    return c.json(promptsService.listPaginated(category, language, q, page, limit));
  });

  app.get('/options', zValidator('query', promptSetOptionsQuerySchema), (c) => {
    const { language, category } = c.req.valid('query');
    return c.json({ items: promptsService.listOptions(language, category) });
  });

  app.post('/playground/run', zValidator('json', promptPlaygroundRunSchema), async (c) => {
    const body = c.req.valid('json');
    const item = await promptPlaygroundService.run(body);
    return c.json({ item });
  });

  app.get('/settings', (c) => {
    const item = promptsSettingsService.get();
    return c.json({ item });
  });

  app.get('/thumbnail-styles', zValidator('query', thumbnailStylesQuerySchema), (c) => {
    const { language } = c.req.valid('query');
    return c.json({ items: listThumbnailStyleOptions(language) });
  });

  app.patch('/settings', zValidator('json', updatePromptsSettingsSchema), (c) => {
    const body = c.req.valid('json');
    const item = promptsSettingsService.update(body);
    return c.json({ item });
  });

  app.get('/key/:key/resolve', zValidator('query', promptKeyQuerySchema), async (c) => {
    const { language } = c.req.valid('query');
    const item = await promptsService.resolveLegacyKey(c.req.param('key'), language);
    return c.json({ item });
  });

  app.get('/key/:key', zValidator('query', promptKeyQuerySchema), (c) => {
    const { language } = c.req.valid('query');
    const item = promptsService.getByKey(c.req.param('key'), language);
    return c.json({ item });
  });

  app.get('/:id/resolve', async (c) => {
    const item = await promptsService.resolve(c.req.param('id'));
    return c.json({ item });
  });

  app.get('/:id', (c) => {
    const item = promptsService.getById(c.req.param('id'));
    return c.json({ item });
  });

  app.post('/', zValidator('json', createPromptSetSchema), async (c) => {
    const body = c.req.valid('json');
    const item = await promptsService.create(body);
    return c.json({ item }, 201);
  });

  app.patch('/:id', zValidator('json', updatePromptSetSchema), async (c) => {
    const body = c.req.valid('json');
    const item = await promptsService.update(c.req.param('id'), body);
    return c.json({ item });
  });

  app.delete('/:id', async (c) => {
    await promptsService.delete(c.req.param('id'));
    return c.json({ ok: true });
  });

  app.onError((err, c) => {
    if (isAppError(err)) {
      return c.json({ error: err.message, code: err.code }, err.statusCode as 502);
    }
    console.error('[prompts]', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message }, 500);
  });

  return app;
}
