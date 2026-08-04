import { serve } from '@hono/node-server';
import { createApp } from './app/register-modules.js';
import { ensureDataDirs } from './config/paths.js';
import { env } from './config/env.js';
import { startRenderQueueWorker } from './modules/render-queue/render-queue.worker.js';
import { startTaskQueueWorker } from './modules/task-queue/task-queue.worker.js';
import { promptsRepository } from './modules/prompts/prompts.repository.js';
import { ensurePromptsDir } from './modules/prompts/prompts.file-store.js';
import { verifySystemChrome } from './infrastructure/chrome/verify-chrome.js';

export function startServer() {
  ensureDataDirs();
  promptsRepository.ensureStoreFile();
  void ensurePromptsDir();
  void verifySystemChrome();

  // Keep the process alive on stray rejections; task/HTTP paths still handle errors themselves.
  process.on('unhandledRejection', reason => {
    console.error('[unhandledRejection]', reason);
  });

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
