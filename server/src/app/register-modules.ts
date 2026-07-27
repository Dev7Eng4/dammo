import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { isAppError } from '../shared/http/errors.js';
import { createChromeProfilesRoutes } from '../modules/chrome-profiles/chrome-profiles.routes.js';
import { createContentDownloadRoutes } from '../modules/content-download/content-download.routes.js';
import { createDashboardRoutes } from '../modules/dashboard/dashboard.routes.js';
import { createGpmManagerRoutes } from '../modules/gpm-manager/gpm-manager.routes.js';
import { createHealthRoutes } from '../modules/health/health.routes.js';
import { createLlmBrowserRoutes } from '../modules/llm-browser/llm-browser.routes.js';
import { createMailAccountsRoutes } from '../modules/mail-accounts/mail-accounts.routes.js';
import { createProxiesRoutes } from '../modules/proxies/proxies.routes.js';
import { createPromptsRoutes } from '../modules/prompts/prompts.routes.js';
import { createRenderQueueRoutes } from '../modules/render-queue/render-queue.routes.js';
import { createSearchRoutes } from '../modules/search/search.routes.js';
import { createSourceChannelsRoutes } from '../modules/source-channels/source-channels.routes.js';
import { createTaskQueueRoutes } from '../modules/task-queue/task-queue.routes.js';
import { createNichesRoutes } from '../modules/niches/niches.routes.js';
import { createVisualStylesRoutes } from '../modules/visual-styles/visual-styles.routes.js';
import { createYoutubeChannelsRoutes } from '../modules/youtube-channels/youtube-channels.routes.js';
import { createAssetsRoutes } from '../modules/assets/assets.routes.js';

function mountApiRoutes(app: Hono, prefix: string) {
  app.route(`${prefix}/dashboard`, createDashboardRoutes());
  app.route(`${prefix}/mail-accounts`, createMailAccountsRoutes());
  app.route(`${prefix}/proxies`, createProxiesRoutes());
  app.route(`${prefix}/search`, createSearchRoutes());
  app.route(`${prefix}/youtube-channels`, createYoutubeChannelsRoutes());
  app.route(`${prefix}/source-channels`, createSourceChannelsRoutes());
  app.route(`${prefix}/render-queue`, createRenderQueueRoutes());
  app.route(`${prefix}/task-queue`, createTaskQueueRoutes());
  app.route(`${prefix}/chrome-profiles`, createChromeProfilesRoutes());
  app.route(`${prefix}/llm-browser`, createLlmBrowserRoutes());
  app.route(`${prefix}/content-download`, createContentDownloadRoutes());
  app.route(`${prefix}/prompts`, createPromptsRoutes());
  app.route(`${prefix}/visual-styles`, createVisualStylesRoutes());
  app.route(`${prefix}/niches`, createNichesRoutes());
  app.route(`${prefix}/gpm`, createGpmManagerRoutes());
  app.route(`${prefix}/assets`, createAssetsRoutes());
}

export function registerModules(app: Hono) {
  const health = createHealthRoutes();
  app.route('/', health);
  app.route('/api', health);

  mountApiRoutes(app, '/api/v1');
  mountApiRoutes(app, '/api');
}

export function createApp() {
  const app = new Hono();

  app.use('*', cors());

  app.onError((err, c) => {
    if (isAppError(err)) {
      return c.json({ error: err.message, code: err.code }, err.statusCode as 400);
    }
    console.error(err);
    return c.json({ error: 'Internal server error' }, 500);
  });

  registerModules(app);

  app.notFound((c) => c.json({ error: 'Not found' }, 404));

  return app;
}
