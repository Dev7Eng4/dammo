import { Hono } from 'hono';
import { dashboardService } from './dashboard.service.js';

export function createDashboardRoutes() {
  const app = new Hono();

  app.get('/overview', (c) => c.json(dashboardService.getOverview()));
  app.get('/pipeline', (c) => c.json(dashboardService.getPipeline()));
  app.get('/accounts', (c) => c.json(dashboardService.getAccounts()));
  app.get('/active-render', (c) => c.json(dashboardService.getActiveRender()));
  app.get('/recent-projects', (c) => c.json(dashboardService.getRecentProjects()));
  app.get('/health-alerts', (c) => c.json(dashboardService.getHealthAlerts()));

  return app;
}
