import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { Readable } from 'node:stream';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { downloadsRoot } from './manual-video.library.js';
import { manualVideoService, scriptToText } from './manual-video.service.js';

/** Byte-range streaming so the browser can seek inside long audio. */
function streamFile(request: Request, filePath: string, contentType: string): Response {
  const size = fs.statSync(filePath).size;
  const headers = { 'Accept-Ranges': 'bytes', 'Content-Type': contentType, 'Cache-Control': 'private, no-cache' };
  const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range')?.trim() ?? '');
  if (!match) {
    const body = Readable.toWeb(fs.createReadStream(filePath));
    return new Response(body as ReadableStream, { status: 200, headers: { ...headers, 'Content-Length': String(size) } });
  }
  const start = match[1] ? Number(match[1]) : 0;
  const end = Math.min(match[2] ? Number(match[2]) : size - 1, size - 1);
  if (start > end) return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
  const body = Readable.toWeb(fs.createReadStream(filePath, { start, end }));
  return new Response(body as ReadableStream, {
    status: 206,
    headers: { ...headers, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}` },
  });
}

const createSchema = z.object({
  channelId: z.string().min(1),
  sourceUrls: z.array(z.string().min(1)).min(1).max(5),
  notes: z.string().max(4000).optional(),
  voicevoxSpeaker: z.number().int().min(0).optional(),
  speedScale: z.number().min(0.7).max(1.5).optional(),
});

const stepSchema = z.object({
  urls: z.array(z.string().min(1)).min(1).max(5).optional(),
  voicevoxSpeaker: z.number().int().min(0).optional(),
  speedScale: z.number().min(0.7).max(1.5).optional(),
});

const scriptSchema = z.object({ text: z.string().min(1).max(200_000) });

const remakeSchema = z.object({
  provider: z.enum(['gpt', 'gemini']).optional(),
  promptSetId: z.string().optional(),
  notes: z.string().max(4000).optional(),
});

const importSchema = z.object({ jobId: z.string().optional() });

export function createManualVideoRoutes() {
  const app = new Hono();

  app.get('/storage', c => c.json({ root: manualVideoService.storageRoot() }));

  app.get('/library', c => c.json({ root: manualVideoService.storageRoot(), downloadsRoot: downloadsRoot(), items: manualVideoService.library() }));

  app.get('/projects', c => c.json({ items: manualVideoService.list() }));

  app.post('/projects', zValidator('json', createSchema), c => c.json(manualVideoService.create(c.req.valid('json')), 201));

  app.get('/projects/:id', c => {
    const run = manualVideoService.get(c.req.param('id'));
    return c.json({
      run,
      scriptText: run.script ? scriptToText(run.script.outline.title, run.script.chapters) : '',
      motionDefault: manualVideoService.motionDefault(run),
    });
  });

  app.put('/projects/:id/channel', zValidator('json', z.object({ channelId: z.string().min(1) })), c =>
    c.json(manualVideoService.setChannel(c.req.param('id'), c.req.valid('json').channelId)),
  );

  app.delete('/projects/:id', c => {
    manualVideoService.remove(c.req.param('id'));
    return c.json({ ok: true });
  });

  app.post('/projects/:id/steps/:step', zValidator('json', stepSchema), c => {
    const step = z.enum(['sources', 'voice', 'scenes', 'video']).parse(c.req.param('step'));
    return c.json(manualVideoService.runStep(c.req.param('id'), step, c.req.valid('json')), 202);
  });

  app.get('/projects/:id/narration', async c => c.json({ narration: await manualVideoService.narration(c.req.param('id')) }));

  app.get('/projects/:id/audio', c => streamFile(c.req.raw, manualVideoService.audioFile(c.req.param('id')), 'audio/mpeg'));

  app.get('/projects/:id/scenes', async c => c.json({ items: await manualVideoService.listScenes(c.req.param('id')) }));

  app.get('/projects/:id/scenes/:index/image', async c => {
    const file = manualVideoService.sceneImage(c.req.param('id'), Number(c.req.param('index')));
    return new Response(new Uint8Array(await fsp.readFile(file)), {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable' },
    });
  });

  app.post(
    '/projects/:id/scenes/:index/regenerate',
    zValidator('json', z.object({ prompt: z.string().max(4000).optional() })),
    c => c.json(manualVideoService.regenerateScene(c.req.param('id'), Number(c.req.param('index')), c.req.valid('json').prompt), 202),
  );

  app.post(
    '/projects/:id/motion',
    zValidator('json', z.object({ mode: z.enum(['intro', 'full', 'scenes']), indexes: z.array(z.number().int().min(0)).max(500).optional() })),
    c => {
      const body = c.req.valid('json');
      return c.json(manualVideoService.generateClips(c.req.param('id'), body.mode, body.indexes), 202);
    },
  );

  app.get('/projects/:id/scenes/:index/clip', c =>
    streamFile(c.req.raw, manualVideoService.sceneClip(c.req.param('id'), Number(c.req.param('index'))), 'video/mp4'),
  );

  app.delete('/projects/:id/scenes/:index/clip', async c =>
    c.json(await manualVideoService.removeClip(c.req.param('id'), Number(c.req.param('index')))),
  );

  app.post('/projects/:id/cancel', c => c.json(manualVideoService.cancel(c.req.param('id'))));

  app.put('/projects/:id/script', zValidator('json', scriptSchema), async c =>
    c.json(await manualVideoService.saveScript(c.req.param('id'), c.req.valid('json').text)),
  );

  app.post('/projects/:id/script/remake', zValidator('json', remakeSchema), async c =>
    c.json(await manualVideoService.startRemake(c.req.param('id'), c.req.valid('json')), 202),
  );

  app.post('/projects/:id/script/import-remake', zValidator('json', importSchema), async c =>
    c.json(await manualVideoService.importRemake(c.req.param('id'), c.req.valid('json').jobId)),
  );

  app.post('/projects/:id/approve', c => c.json(manualVideoService.approve(c.req.param('id'))));

  app.post('/open-path', zValidator('json', z.object({ path: z.string().min(1) })), c =>
    c.json(manualVideoService.openPath(c.req.valid('json').path)),
  );

  app.post('/projects/:id/open-folder', c => c.json(manualVideoService.openFolder(c.req.param('id'))));

  return app;
}
