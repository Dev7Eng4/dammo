import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { listTrendRadar } from './radar-trends.js';
import { radarService } from './radar.service.js';

const listQuerySchema = z.object({
  maxAgeHours: z.coerce.number().positive().max(24 * 45).optional(),
  minViews: z.coerce.number().int().min(0).optional(),
  minDurationSeconds: z.coerce.number().int().min(0).optional(),
  minRatio: z.coerce.number().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  verdict: z.enum(['do', 'maybe', 'skip']).optional(),
});

export function createRadarRoutes() {
  const app = new Hono();

  const trendsQuerySchema = z.object({
    days: z.coerce.number().positive().max(90).optional(),
    cluster: z.string().regex(/^(K([1-9]|1[01])|off|none)$/).optional(),
    verdict: z.enum(['do', 'maybe', 'skip']).optional(),
    limit: z.coerce.number().int().min(1).max(600).optional(),
  });

  // Hot videos found by the jp-psy-trends brain / skill, tagged with their K1–K11 cluster.
  app.get('/trends', zValidator('query', trendsQuerySchema), c => c.json(listTrendRadar(c.req.valid('query'))));

  app.get('/status', c => c.json(radarService.status()));

  app.get('/', zValidator('query', listQuerySchema), c => c.json(radarService.list(c.req.valid('query'))));

  app.post('/scan', async c => c.json(await radarService.scan()));

  return app;
}
