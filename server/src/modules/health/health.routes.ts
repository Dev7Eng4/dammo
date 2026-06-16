import { Hono } from 'hono';

export function createHealthRoutes() {
  const app = new Hono();

  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.get('/hello', (c) => c.json({ message: 'Hello from Node.js backend!' }));

  return app;
}
