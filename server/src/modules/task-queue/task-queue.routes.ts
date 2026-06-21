import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { zValidator } from '@hono/zod-validator';
import { isAppError } from '../../shared/http/errors.js';
import { onTaskQueueEvent } from './task-queue.events.js';
import { enqueueTaskSchema } from './task-queue.schema.js';
import { taskQueueService } from './task-queue.service.js';

export function createTaskQueueRoutes() {
  const app = new Hono();

  app.get('/', (c) => {
    const view = c.req.query('view') === 'summary' ? 'summary' : 'full';
    return c.json(taskQueueService.list(view));
  });

  app.get('/stream', (c) => {
    return streamSSE(c, async (stream) => {
      const send = (data: unknown, event: string) =>
        stream.writeSSE({ data: JSON.stringify(data), event });

      await send(
        {
          items: taskQueueService.listSummariesForStream(),
          paused: taskQueueService.list('summary').paused,
        },
        'snapshot',
      );

      const unsubscribe = onTaskQueueEvent((event) => {
        if (event.type === 'snapshot') return;
        void send(event, event.type);
      });

      const abortSignal = c.req.raw.signal;
      const onAbort = () => {
        unsubscribe();
      };
      abortSignal.addEventListener('abort', onAbort, { once: true });

      try {
        while (!abortSignal.aborted) {
          await stream.sleep(30000);
          if (abortSignal.aborted) break;
          await stream.writeSSE({ data: 'ping', event: 'ping' });
        }
      } finally {
        abortSignal.removeEventListener('abort', onAbort);
        unsubscribe();
      }
    });
  });

  app.post('/pause', (c) => c.json(taskQueueService.pause()));

  app.post('/resume', (c) => c.json(taskQueueService.resume()));

  app.post('/clear', (c) => c.json(taskQueueService.clearFinished()));

  app.get('/:id/logs', (c) => {
    const after = Number(c.req.query('after') ?? '0');
    const safeAfter = Number.isFinite(after) ? Math.max(0, Math.floor(after)) : 0;
    return c.json(taskQueueService.getLogs(c.req.param('id'), safeAfter));
  });

  app.get('/:id', (c) => c.json({ item: taskQueueService.getById(c.req.param('id')) }));

  app.post('/', zValidator('json', enqueueTaskSchema), (c) => {
    const body = c.req.valid('json');
    const item = taskQueueService.enqueue(body);
    return c.json({ item }, 202);
  });

  app.post('/:id/cancel', (c) => {
    const item = taskQueueService.cancel(c.req.param('id'));
    return c.json({ item });
  });

  app.onError((err, c) => {
    if (isAppError(err)) {
      return c.json({ error: err.message, code: err.code }, err.statusCode as 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  });

  return app;
}
