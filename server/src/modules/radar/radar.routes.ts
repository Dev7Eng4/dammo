import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { radarService } from './radar.service.js';

const listQuerySchema = z.object({
  maxAgeHours: z.coerce.number().positive().max(24 * 45).optional(),
  minViews: z.coerce.number().int().min(0).optional(),
  minDurationSeconds: z.coerce.number().int().min(0).optional(),
  minRatio: z.coerce.number().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export function createRadarRoutes() {
  const app = new Hono();

  app.get('/status', c => c.json(radarService.status()));

  app.get('/', zValidator('query', listQuerySchema), c => c.json(radarService.list(c.req.valid('query'))));

  app.post('/scan', async c => c.json(await radarService.scan()));

  return app;
}
