import { serve } from '@hono/node-server';
import { createApp } from './app/register-modules.js';
import { ensureDataDirs } from './config/paths.js';
import { env } from './config/env.js';
import { startRenderQueueWorker } from './modules/render-queue/render-queue.worker.js';
import {
  reclaimOrphanRunningJobs,
  startTaskQueueWorker,
  stopTaskQueueWorker,
} from './modules/task-queue/task-queue.worker.js';
import { promptsRepository } from './modules/prompts/prompts.repository.js';
import { ensurePromptsDir } from './modules/prompts/prompts.file-store.js';
import { verifySystemChrome } from './infrastructure/chrome/verify-chrome.js';

let shuttingDown = false;

function gracefulShutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[server] ${signal} received — shutting down`);
  try {
    stopTaskQueueWorker();
    reclaimOrphanRunningJobs();
  } catch (err) {
    console.error('[server] shutdown cleanup failed', err);
  }
  process.exit(0);
}

export function startServer() {
  ensureDataDirs();
  promptsRepository.ensureStoreFile();
  void ensurePromptsDir();
  void verifySystemChrome();

  // Keep the process alive on stray rejections; task/HTTP paths still handle errors themselves.
  process.on('unhandledRejection', reason => {
    console.error('[unhandledRejection]', reason);
  });

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  const app = createApp();

  startRenderQueueWorker();
  startTaskQueueWorker();

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
