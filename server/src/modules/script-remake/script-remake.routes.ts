import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { scriptRemakeService } from './script-remake.service.js';

const languageSchema = z.enum(['en', 'ko', 'ja', 'es', 'all']);

const startRemakeSchema = z.object({
  relativePath: z.string().min(1),
  language: languageSchema,
  notes: z.string().max(4000).optional(),
  promptSetId: z.string().optional(),
  provider: z.enum(['gpt', 'gemini']).optional(),
});

export function createScriptRemakeRoutes() {
  const app = new Hono();

  app.get('/prompts', zValidator('query', z.object({ language: languageSchema })), async c =>
    c.json({ items: await scriptRemakeService.listPromptSets(c.req.valid('query').language) }),
  );

  app.post('/jobs', zValidator('json', startRemakeSchema), async c =>
    c.json(await scriptRemakeService.start(c.req.valid('json')), 202),
  );

  app.get('/jobs/:id', c => c.json(scriptRemakeService.get(c.req.param('id'))));

  return app;
}
