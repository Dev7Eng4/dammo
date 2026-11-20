import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { onBrainEvent } from './brains.events.js';
import { saveInput } from './brain-engine.js';
import { brainsService } from './brains.service.js';

const trendVideoSchema = z.object({
  videoId: z.string().min(1).max(20),
  title: z.string().max(500),
  channel: z.string().max(300),
  channelId: z.string().max(40).optional(),
  views: z.number().min(0),
  published: z.string().max(80),
  hoursAgo: z.number().nullable(),
  viewsPerHour: z.number().nullable(),
  durationSeconds: z.number().nullable(),
  url: z.string().url(),
});

const importSchema = saveInput.extend({
  videos: z.array(trendVideoSchema).max(500),
  channels: z
    .array(z.object({ channelId: z.string().regex(/^UC[\w-]{22}$/), name: z.string().max(300), subscribers: z.string().max(80) }))
    .max(100)
    .optional(),
  ratios: z.record(z.string(), z.number().min(0)).optional(),
  summary: z.string().max(4000).optional(),
  source: z.string().max(120).optional(),
});

export function createBrainsRoutes() {
  const app = new Hono();

  app.get('/', c => c.json(brainsService.snapshot()));

  app.get('/stream', c =>
    streamSSE(c, async stream => {
      const unsubscribe = onBrainEvent(event => {
        void stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
      });
      const signal = c.req.raw.signal;
      try {
        while (!signal.aborted) {
          await stream.sleep(30000);
          if (!signal.aborted) await stream.writeSSE({ event: 'ping', data: 'ping' });
        }
      } finally {
        unsubscribe();
      }
    }),
  );

  app.post('/pipeline/run', zValidator('json', z.object({ notes: z.string().max(1000).optional() })), c =>
    c.json(brainsService.runPipeline(c.req.valid('json').notes?.trim() || undefined), 202),
  );

  app.post('/pipeline/cancel', c => c.json(brainsService.cancelPipeline()));

  app.post('/:id/run', zValidator('json', z.object({ notes: z.string().max(1000).optional() })), c =>
    c.json(brainsService.run(c.req.param('id'), c.req.valid('json').notes?.trim() || undefined), 202),
  );

  app.post('/:id/import', zValidator('json', importSchema), c =>
    c.json(brainsService.importFindings(c.req.param('id'), c.req.valid('json'))),
  );

  app.post('/:id/cancel', c => c.json(brainsService.cancel(c.req.param('id'))));

  app.post('/:id/forget', c => c.json(brainsService.forget(c.req.param('id'))));

  app.patch('/:id', zValidator('json', z.object({ autoIntervalHours: z.number().min(0).max(168) })), c =>
    c.json(brainsService.setAutoInterval(c.req.param('id'), c.req.valid('json').autoIntervalHours)),
  );

  return app;
}
