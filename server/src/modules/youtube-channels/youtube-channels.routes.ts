import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { isAppError } from '../../shared/http/errors.js';
import {
  createVideosBatchSchema,
  createYoutubeChannelSchema,
  deleteUploadedVideosSchema,
  deleteYoutubeVideosSchema,
  listYoutubeChannelsQuerySchema,
  updateYoutubeVideoContentSchema,
  updateYoutubeChannelSchema,
} from './youtube-channels.schema.js';
import { youtubeChannelsRepository } from './youtube-channels.repository.js';
import { youtubeChannelsService } from './youtube-channels.service.js';
import { uploadVideosBatchSchema, uploadVideosSchema } from '../youtube-upload/youtube-upload.schema.js';
import { youtubeUploadService } from '../youtube-upload/youtube-upload.service.js';
import {
  youtubeVideoContentService,
  type YoutubeThumbnailUpload,
  type YoutubeVideoAssetKind,
} from './youtube-video-content.service.js';
import {
  thumbnailBackgroundsService,
  type ThumbnailBackgroundContentType,
  type ThumbnailBackgroundUpload,
} from './thumbnail-backgrounds.service.js';
import {
  channelAvatarsService,
  type ChannelAvatarContentType,
  type ChannelAvatarUpload,
} from './channel-avatars.service.js';

const THUMBNAIL_MAX_SIZE_BYTES = 10 * 1024 * 1024;
const THUMBNAIL_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function streamFileAsset(
  request: Request,
  asset: { filePath: string; contentType: string; size: number },
): Response {
  const range = request.headers.get('range');
  const commonHeaders = {
    'Accept-Ranges': 'bytes',
    'Content-Type': asset.contentType,
    'Cache-Control': 'private, no-cache',
  };

  if (!range) {
    const body = Readable.toWeb(fs.createReadStream(asset.filePath));
    return new Response(body as ReadableStream, {
      status: 200,
      headers: { ...commonHeaders, 'Content-Length': String(asset.size) },
    });
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  const start = match?.[1] ? Number(match[1]) : 0;
  const requestedEnd = match?.[2] ? Number(match[2]) : asset.size - 1;
  const end = Math.min(requestedEnd, asset.size - 1);

  if (!match || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end) {
    return new Response(null, {
      status: 416,
      headers: { ...commonHeaders, 'Content-Range': `bytes */${asset.size}` },
    });
  }

  const body = Readable.toWeb(fs.createReadStream(asset.filePath, { start, end }));
  return new Response(body as ReadableStream, {
    status: 206,
    headers: {
      ...commonHeaders,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${asset.size}`,
    },
  });
}

function streamVideoAsset(
  request: Request,
  asset: ReturnType<typeof youtubeVideoContentService.getAsset>,
): Response {
  return streamFileAsset(request, asset);
}

async function parseThumbnailBackgroundUpload(body: Record<string, unknown>): Promise<
  | { ok: true; upload: ThumbnailBackgroundUpload }
  | { ok: false; error: string; status: 400 }
> {
  const file = body.file;
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'File is required', status: 400 };
  }
  if (!THUMBNAIL_CONTENT_TYPES.has(file.type)) {
    return { ok: false, error: 'Image must be a JPEG, PNG, or WebP', status: 400 };
  }
  if (file.size > THUMBNAIL_MAX_SIZE_BYTES) {
    return { ok: false, error: 'Image must not exceed 10 MB', status: 400 };
  }
  return {
    ok: true,
    upload: {
      buffer: Buffer.from(await file.arrayBuffer()),
      contentType: file.type as ThumbnailBackgroundContentType,
      originalName: file.name || 'background',
    },
  };
}

async function parseChannelAvatarUpload(body: Record<string, unknown>): Promise<
  | { ok: true; upload: ChannelAvatarUpload }
  | { ok: false; error: string; status: 400 }
> {
  const file = body.file;
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'File is required', status: 400 };
  }
  if (!THUMBNAIL_CONTENT_TYPES.has(file.type)) {
    return { ok: false, error: 'Image must be a JPEG, PNG, or WebP', status: 400 };
  }
  if (file.size > THUMBNAIL_MAX_SIZE_BYTES) {
    return { ok: false, error: 'Image must not exceed 10 MB', status: 400 };
  }
  return {
    ok: true,
    upload: {
      buffer: Buffer.from(await file.arrayBuffer()),
      contentType: file.type as ChannelAvatarContentType,
    },
  };
}

export function createYoutubeChannelsRoutes() {
  const app = new Hono();

  app.get('/stats', (c) => c.json(youtubeChannelsService.getStats()));

  app.post('/', zValidator('json', createYoutubeChannelSchema), async (c) => {
    const body = c.req.valid('json');
    const item = await youtubeChannelsService.create(body);
    return c.json({ item }, 201);
  });

  app.patch('/:id', zValidator('json', updateYoutubeChannelSchema), async (c) => {
    const body = c.req.valid('json');
    const item = await youtubeChannelsService.update(c.req.param('id'), body);
    return c.json({ item });
  });

  app.delete('/:id', (c) => {
    youtubeChannelsService.deleteChannel(c.req.param('id'));
    return c.body(null, 204);
  });

  app.get('/', zValidator('query', listYoutubeChannelsQuerySchema), (c) => {
    const { type, monetization, q, page, limit } = c.req.valid('query');
    return c.json(youtubeChannelsService.listPaginated(type, monetization, q, page, limit));
  });

  app.get('/thumbnail-backgrounds/temp/:sessionId', (c) => {
    const sessionId = c.req.param('sessionId');
    const urlPrefix = `/api/v1/youtube-channels/thumbnail-backgrounds/temp/${encodeURIComponent(sessionId)}`;
    return c.json({ items: thumbnailBackgroundsService.listTemp(sessionId, urlPrefix) });
  });

  app.post('/thumbnail-backgrounds/temp/:sessionId', async (c) => {
    const sessionId = c.req.param('sessionId');
    const body = await c.req.parseBody();
    const parsed = await parseThumbnailBackgroundUpload(body);
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, parsed.status);
    }
    const urlPrefix = `/api/v1/youtube-channels/thumbnail-backgrounds/temp/${encodeURIComponent(sessionId)}`;
    const item = await thumbnailBackgroundsService.uploadTemp(sessionId, parsed.upload, urlPrefix);
    return c.json({ item }, 201);
  });

  app.get('/thumbnail-backgrounds/temp/:sessionId/:filename', (c) => {
    const asset = thumbnailBackgroundsService.getTempAsset(
      c.req.param('sessionId'),
      c.req.param('filename'),
    );
    return streamFileAsset(c.req.raw, asset);
  });

  app.delete('/thumbnail-backgrounds/temp/:sessionId/:filename', (c) => {
    const name = thumbnailBackgroundsService.deleteTemp(
      c.req.param('sessionId'),
      c.req.param('filename'),
    );
    return c.json({ deleted: name });
  });

  app.post('/avatars/temp/:sessionId', async (c) => {
    const sessionId = c.req.param('sessionId');
    const body = await c.req.parseBody();
    const parsed = await parseChannelAvatarUpload(body);
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, parsed.status);
    }
    const urlPrefix = `/api/v1/youtube-channels/avatars/temp/${encodeURIComponent(sessionId)}`;
    const item = await channelAvatarsService.uploadTemp(sessionId, parsed.upload, urlPrefix);
    return c.json({ item }, 201);
  });

  app.get('/avatars/temp/:sessionId/:filename', (c) => {
    const asset = channelAvatarsService.getTempAsset(c.req.param('sessionId'), c.req.param('filename'));
    return streamFileAsset(c.req.raw, asset);
  });

  app.get('/:id/thumbnail-backgrounds', (c) => {
    const id = c.req.param('id');
    youtubeChannelsService.getById(id);
    const urlPrefix = `/api/v1/youtube-channels/${encodeURIComponent(id)}/thumbnail-backgrounds`;
    return c.json({ items: thumbnailBackgroundsService.listForChannel(id, urlPrefix) });
  });

  app.post('/:id/thumbnail-backgrounds', async (c) => {
    const id = c.req.param('id');
    youtubeChannelsService.getById(id);
    const body = await c.req.parseBody();
    const parsed = await parseThumbnailBackgroundUpload(body);
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, parsed.status);
    }
    const urlPrefix = `/api/v1/youtube-channels/${encodeURIComponent(id)}/thumbnail-backgrounds`;
    const item = await thumbnailBackgroundsService.uploadForChannel(id, parsed.upload, urlPrefix);
    return c.json({ item }, 201);
  });

  app.post('/:id/avatar', async (c) => {
    const id = c.req.param('id');
    youtubeChannelsService.getById(id);
    const body = await c.req.parseBody();
    const parsed = await parseChannelAvatarUpload(body);
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, parsed.status);
    }
    const urlPrefix = `/api/v1/youtube-channels/${encodeURIComponent(id)}/avatar`;
    const item = await channelAvatarsService.uploadForChannel(id, parsed.upload, urlPrefix);
    return c.json({ item }, 201);
  });

  app.get('/:id/avatar/:filename', (c) => {
    const id = c.req.param('id');
    youtubeChannelsService.getById(id);
    const asset = channelAvatarsService.getChannelAsset(id, c.req.param('filename'));
    return streamFileAsset(c.req.raw, asset);
  });

  app.get('/:id/thumbnail-backgrounds/:filename', (c) => {
    const id = c.req.param('id');
    youtubeChannelsService.getById(id);
    const asset = thumbnailBackgroundsService.getChannelAsset(id, c.req.param('filename'));
    return streamFileAsset(c.req.raw, asset);
  });

  app.delete('/:id/thumbnail-backgrounds/:filename', (c) => {
    const id = c.req.param('id');
    youtubeChannelsService.getById(id);
    const name = thumbnailBackgroundsService.deleteForChannel(id, c.req.param('filename'));
    youtubeChannelsRepository.update(id, current => {
      if (current.thumbnailBackgroundFile !== name) return current;
      const next = { ...current };
      delete next.thumbnailBackgroundFile;
      return next;
    });
    return c.json({ deleted: name });
  });

  app.get('/:id/videos/pending', (c) => {
    const result = youtubeChannelsService.getPendingSourceVideos(c.req.param('id'));
    return c.json(result);
  });

  app.get('/:id/videos/:videoId/comments', async (c) => {
    const result = await youtubeChannelsService.getVideoComments(
      c.req.param('id'),
      c.req.param('videoId'),
    );
    return c.json(result);
  });

  app.get('/:id/videos/:videoId/content', (c) => {
    const item = youtubeVideoContentService.get(c.req.param('id'), c.req.param('videoId'));
    const baseUrl = c.req.path;
    return c.json({
      ...item,
      thumbnailUrl: item.hasThumbnail ? `${baseUrl}/thumbnail` : null,
      oldThumbnailUrl: item.hasOldThumbnail ? `${baseUrl}/old-thumbnail` : null,
      videoUrl: item.hasVideo ? `${baseUrl}/video` : null,
    });
  });

  app.post('/:id/videos/:videoId/mark-uploaded', async (c) => {
    const result = await youtubeUploadService.markAsUploaded(
      c.req.param('id'),
      c.req.param('videoId'),
    );
    return c.json(result);
  });

  app.patch('/:id/videos/:videoId/content', async (c) => {
    const body = await c.req.parseBody();
    let tags: unknown = [];
    try {
      tags = JSON.parse(typeof body.tags === 'string' ? body.tags : '[]');
    } catch {
      return c.json({ error: 'Tags must be a valid JSON array' }, 400);
    }

    const parsed = updateYoutubeVideoContentSchema.safeParse({
      title: body.title,
      description: body.description,
      tags,
    });
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid video content' }, 400);
    }

    const thumbnail = body.thumbnail;
    let thumbnailUpload: YoutubeThumbnailUpload | undefined;
    if (thumbnail !== undefined) {
      if (!(thumbnail instanceof File) || thumbnail.size === 0) {
        return c.json({ error: 'Thumbnail image is required' }, 400);
      }
      if (!THUMBNAIL_CONTENT_TYPES.has(thumbnail.type)) {
        return c.json({ error: 'Thumbnail must be a JPEG, PNG, or WebP image' }, 400);
      }
      if (thumbnail.size > THUMBNAIL_MAX_SIZE_BYTES) {
        return c.json({ error: 'Thumbnail image must not exceed 10 MB' }, 400);
      }
      thumbnailUpload = {
        buffer: Buffer.from(await thumbnail.arrayBuffer()),
        contentType: thumbnail.type as YoutubeThumbnailUpload['contentType'],
      };
    }

    const item = await youtubeVideoContentService.update(
      c.req.param('id'),
      c.req.param('videoId'),
      parsed.data,
      thumbnailUpload,
    );
    const baseUrl = c.req.path;
    return c.json({
      ...item,
      thumbnailUrl: item.hasThumbnail ? `${baseUrl}/thumbnail` : null,
      oldThumbnailUrl: item.hasOldThumbnail ? `${baseUrl}/old-thumbnail` : null,
      videoUrl: item.hasVideo ? `${baseUrl}/video` : null,
    });
  });

  app.get('/:id/videos/:videoId/content/:asset', (c) => {
    const assetKind = c.req.param('asset');
    if (
      assetKind !== 'thumbnail' &&
      assetKind !== 'old-thumbnail' &&
      assetKind !== 'video'
    ) {
      return c.json({ error: 'Asset not found' }, 404);
    }
    const asset = youtubeVideoContentService.getAsset(
      c.req.param('id'),
      c.req.param('videoId'),
      assetKind as YoutubeVideoAssetKind,
    );
    return streamVideoAsset(c.req.raw, asset);
  });

  app.get('/:id/videos', async (c) => {
    const result = await youtubeChannelsService.getVideos(c.req.param('id'));
    return c.json(result);
  });

  app.delete('/:id/videos', zValidator('json', deleteYoutubeVideosSchema), (c) => {
    const body = c.req.valid('json');
    const result = youtubeChannelsService.deleteVideos(c.req.param('id'), body.videoIds);
    return c.json(result);
  });

  app.delete('/uploaded-videos', zValidator('json', deleteUploadedVideosSchema), (c) => {
    const body = c.req.valid('json');
    const result = youtubeChannelsService.deleteAllUploadedVideoFolders({
      deletePreparedVideos: body.deletePreparedVideos,
    });
    return c.json(result);
  });

  app.post('/create-videos', async (c) => {
    const contentType = c.req.header('content-type') ?? '';
    let channelIds: string[] | undefined;

    if (contentType.includes('application/json')) {
      const parsed = createVideosBatchSchema.safeParse(await c.req.json());
      if (!parsed.success) {
        return c.json({ error: parsed.error.message }, 400);
      }
      channelIds = parsed.data.channelIds;
    }

    const result = channelIds?.length
      ? await youtubeChannelsService.createVideosForChannels(channelIds)
      : await youtubeChannelsService.createVideosForAllReupChannels();
    return c.json(result);
  });

  app.post('/:id/create-videos', async (c) => {
    const result = await youtubeChannelsService.createVideos(c.req.param('id'));
    return c.json(result);
  });

  app.post('/:id/upload', zValidator('json', uploadVideosSchema), async (c) => {
    const body = c.req.valid('json');
    const result = await youtubeUploadService.uploadChannel(c.req.param('id'), body);
    return c.json(result);
  });

  app.post('/upload-videos', async (c) => {
    const contentType = c.req.header('content-type') ?? '';
    let channelIds: string[] | undefined;
    let maxUploads: number | undefined;
    let videoIds: string[] | undefined;

    if (contentType.includes('application/json')) {
      const parsed = uploadVideosBatchSchema.safeParse(await c.req.json());
      if (!parsed.success) {
        return c.json({ error: parsed.error.message }, 400);
      }
      channelIds = parsed.data.channelIds;
      maxUploads = parsed.data.maxUploads;
      videoIds = parsed.data.videoIds;
    }

    if (channelIds?.length) {
      const result = await youtubeUploadService.uploadChannels(channelIds, { maxUploads, videoIds });
      return c.json(result);
    }

    const allReupIds = youtubeChannelsRepository
      .findAll()
      .filter(ch => ch.type === 'reup_audio' || ch.type === 'reup_video')
      .map(ch => ch.id);

    const result = await youtubeUploadService.uploadChannels(allReupIds, { maxUploads, videoIds });
    return c.json(result);
  });

  app.post('/:id/sync-videos', async (c) => {
    const result = await youtubeChannelsService.syncVideos(c.req.param('id'));
    return c.json(result);
  });

  // Detail page: return stored channel metadata (refresh via POST /:id/sync-videos)
  app.get('/:id', (c) => {
    const item = youtubeChannelsService.getById(c.req.param('id'));
    return c.json(item);
  });

  app.onError((err, c) => {
    if (isAppError(err)) {
      return c.json({ error: err.message, code: err.code }, err.statusCode as 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  });

  return app;
}
