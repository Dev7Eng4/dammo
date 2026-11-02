import fs from 'node:fs';
import { Readable } from 'node:stream';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { streamSSE } from 'hono/streaming';
import { synthesizeVoicevox } from '../../infrastructure/tts/voicevox.client.js';
import { narrationVoiceOptions } from './narration.js';
import { onVideoAgentEvent } from './video-agent.events.js';
import { approvalSchema, createVideoAgentRunSchema, rejectSchema } from './video-agent.schema.js';
import { videoAgentService } from './video-agent.service.js';

const PREVIEW_TEXT = 'こんにちは。今日は、心が少し軽くなるお話をゆっくりお届けします。';

function streamVideo(request: Request, file: { filePath: string; size: number }): Response {
  const headers = { 'Accept-Ranges': 'bytes', 'Content-Type': 'video/mp4', 'Cache-Control': 'private, no-cache' };
  const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range')?.trim() ?? '');
  if (!match) {
    const body = Readable.toWeb(fs.createReadStream(file.filePath));
    return new Response(body as ReadableStream, { status: 200, headers: { ...headers, 'Content-Length': String(file.size) } });
  }
  const start = match[1] ? Number(match[1]) : 0;
  const end = Math.min(match[2] ? Number(match[2]) : file.size - 1, file.size - 1);
  if (start > end) {
    return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${file.size}` } });
  }
  const body = Readable.toWeb(fs.createReadStream(file.filePath, { start, end }));
  return new Response(body as ReadableStream, {
    status: 206,
    headers: { ...headers, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${file.size}` },
  });
}

export function createVideoAgentRoutes() {
  const app = new Hono();

  app.get('/config', c => c.json(videoAgentService.config()));

  app.get('/voicevox', async c => c.json(await videoAgentService.voicevoxStatus()));

  /** A short spoken sample so the producer can hear a voice before choosing it. */
  app.get(
    '/voicevox/preview',
    zValidator(
      'query',
      z.object({
        speaker: z.coerce.number().int().min(0),
        speed: z.coerce.number().min(0.5).max(2).optional(),
        text: z.string().max(200).optional(),
      }),
    ),
    async c => {
      const { speaker, speed, text } = c.req.valid('query');
      const wav = await synthesizeVoicevox(text?.trim() || PREVIEW_TEXT, narrationVoiceOptions(speaker, speed ?? 1));
      return new Response(new Uint8Array(wav), {
        headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'private, max-age=3600' },
      });
    },
  );

  app.get('/runs', c => c.json({ items: videoAgentService.list() }));

  app.post('/runs', zValidator('json', createVideoAgentRunSchema), c =>
    c.json(videoAgentService.create(c.req.valid('json')), 201),
  );

  app.get('/stream', c =>
    streamSSE(c, async stream => {
      await stream.writeSSE({ event: 'snapshot', data: JSON.stringify({ items: videoAgentService.list() }) });
      const unsubscribe = onVideoAgentEvent(event => {
        void stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
      });
      const signal = c.req.raw.signal;
      try {
        while (!signal.aborted) {
          await stream.sleep(30000);
          if (!signal.aborted) await stream.writeSSE({ event: 'ping', data: 'ping' });
        }
      } finally {
        unsubscribe();
      }
    }),
  );

  app.get('/runs/:id', c => c.json(videoAgentService.get(c.req.param('id'))));

  app.get('/runs/:id/video', c => streamVideo(c.req.raw, videoAgentService.videoFile(c.req.param('id'))));

  app.post('/runs/:id/approve', zValidator('json', approvalSchema), c =>
    c.json(videoAgentService.approve(c.req.param('id'), c.req.valid('json').feedback)),
  );

  app.post('/runs/:id/reject', zValidator('json', rejectSchema), c =>
    c.json(videoAgentService.reject(c.req.param('id'), c.req.valid('json').feedback)),
  );

  app.post('/runs/:id/cancel', c => c.json(videoAgentService.cancel(c.req.param('id'))));

  app.post('/runs/:id/resume', c => c.json(videoAgentService.resume(c.req.param('id'))));

  app.delete('/runs/:id', c => {
    videoAgentService.remove(c.req.param('id'));
    return c.json({ ok: true });
  });

  return app;
}
