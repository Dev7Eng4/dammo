import { serve } from '@hono/node-server';
import { createApp } from './app/register-modules.js';
import { ensureDataDirs } from './config/paths.js';
import { env } from './config/env.js';
import { startRenderQueueWorker } from './modules/render-queue/render-queue.worker.js';

export function startServer() {
  ensureDataDirs();

  const app = createApp();

  startRenderQueueWorker();

  serve(
    {
      fetch: app.fetch,
      port: env.port,
    },
    () => {
      console.log(`Server running at http://localhost:${env.port}`);
    },
  );
}

startServer();
