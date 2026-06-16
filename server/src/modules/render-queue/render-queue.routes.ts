import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { renderQueueService } from './render-queue.service.js';
import { isAppError } from '../../shared/http/errors.js';

const createJobSchema = z.object({
  fileName: z.string().min(1),
  inputPath: z.string().min(1),
  preset: z.string().optional(),
});

export function createRenderQueueRoutes() {
  const app = new Hono();

  app.get('/', (c) => c.json(renderQueueService.list()));
  app.get('/active', (c) => c.json(renderQueueService.getActive()));

  app.get('/:id/progress', (c) => {
    const job = renderQueueService.getById(c.req.param('id'));
    return c.json({
      id: job.id,
      status: job.status,
      progress: job.progress,
      eta: job.eta,
      outputPath: job.outputPath,
      error: job.error,
    });
  });

  app.get('/:id', (c) => c.json(renderQueueService.getById(c.req.param('id'))));

  app.post('/', zValidator('json', createJobSchema), (c) => {
    const body = c.req.valid('json');
    const job = renderQueueService.enqueue(body);
    return c.json({ item: job }, 201);
  });

  app.onError((err, c) => {
    if (isAppError(err)) {
      return c.json({ error: err.message, code: err.code }, err.statusCode as 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  });

  return app;
}
