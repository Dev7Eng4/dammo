import { Hono } from 'hono';
import { searchService } from './search.service.js';

export function createSearchRoutes() {
  const app = new Hono();

  app.get('/', (c) => {
    const query = c.req.query('q') ?? '';
    return c.json(searchService.search(query));
  });

  return app;
}
