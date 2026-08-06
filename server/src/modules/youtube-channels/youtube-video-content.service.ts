import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveYoutubeChannelVideoDir } from '../../config/paths.js';
import { runFfmpeg } from '../../infrastructure/ffmpeg/ffmpeg-runner.js';
import { readJson, writeJson } from '../../infrastructure/storage/json-store.js';
import { AppError } from '../../shared/http/errors.js';
import { parseVideoMetaContent } from '../video-production/shared/meta/metadata.types.js';
import {
  findOldThumbnailPath,
  findThumbnailPath,
} from '../youtube-upload/upload-assets.js';
import { findFinalVideoMp4 } from '../video-production/shared/si-video/video-output-file.js';
import { videoPrepareRepository } from './video-prepare.repository.js';
import { youtubeChannelsRepository } from './youtube-channels.repository.js';

const VIDEO_META_FILENAME = 'video-meta.json';
const THUMBNAIL_FILENAME = 'thumbnail.jpg';

export interface YoutubeVideoContent {
  title: string;
  description: string;
  tags: string[];
  hasThumbnail: boolean;
  hasOldThumbnail: boolean;
  oldThumbnailFolderPath: string | null;
  hasVideo: boolean;
}

export interface UpdateYoutubeVideoContentInput {
  title: string;
  description: string;
  tags: string[];
}

export interface YoutubeThumbnailUpload {
  buffer: Buffer;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export type YoutubeVideoAssetKind = 'thumbnail' | 'old-thumbnail' | 'video';

export interface YoutubeVideoAsset {
  filePath: string;
  contentType: string;
  size: number;
}

function assertSafeId(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.includes('..') || normalized.includes('/') || normalized.includes('\\')) {
    throw new AppError(`Invalid ${label}`, 400, 'INVALID_ID');
  }
  return normalized;
}

function requireViewableVideoFolder(channelId: string, videoId: string): string {
  const safeChannelId = assertSafeId(channelId, 'channel id');
  const safeVideoId = assertSafeId(videoId, 'video id');

  if (!youtubeChannelsRepository.findById(safeChannelId)) {
    throw new AppError('Channel not found', 404, 'NOT_FOUND');
  }

  const prepareItem = videoPrepareRepository
    .read(safeChannelId)
    .find(item =>
      item.videoId.trim() === safeVideoId &&
      (item.status === 'Prepared' || item.status === 'Created'),
    );
  if (!prepareItem) {
    throw new AppError(
      'Video is not in Prepared or Created status',
      409,
      'VIDEO_NOT_VIEWABLE',
    );
  }

  const folderPath = resolveYoutubeChannelVideoDir(safeChannelId, safeVideoId);
  if (!folderPath) {
    throw new AppError('Video folder not found', 404, 'VIDEO_FOLDER_NOT_FOUND');
  }
  return folderPath;
}

function metadataPath(folderPath: string): string {
  return path.join(folderPath, VIDEO_META_FILENAME);
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeTags(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  return [...new Set(values.map(tag => normalizeText(tag).trim()).filter(Boolean))];
}

function readRawMetadata(folderPath: string): Record<string, unknown> {
  const filePath = metadataPath(folderPath);
  const raw = readJson<unknown>(filePath);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AppError('video-meta.json not found or invalid', 404, 'VIDEO_METADATA_NOT_FOUND');
  }
  return raw as Record<string, unknown>;
}

function getWritableMetadata(raw: Record<string, unknown>): Record<string, unknown> {
  const result = raw.result;
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const resultRecord = result as Record<string, unknown>;
    const metadata = resultRecord.metadata;
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      return metadata as Record<string, unknown>;
    }
  }

  const metadata = raw.metadata;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }

  throw new AppError('video-meta.json is missing metadata', 422, 'INVALID_VIDEO_METADATA');
}

function imageContentType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    default:
      return 'image/jpeg';
  }
}

function thumbnailUploadExtension(contentType: YoutubeThumbnailUpload['contentType']): string {
  if (contentType === 'image/png') return '.png';
  if (contentType === 'image/webp') return '.webp';
  return '.jpg';
}

async function stageThumbnailJpeg(
  folderPath: string,
  upload: YoutubeThumbnailUpload,
): Promise<string> {
  const token = randomUUID();
  const inputPath = path.join(
    folderPath,
    `.thumbnail-upload-${token}${thumbnailUploadExtension(upload.contentType)}`,
  );
  const outputPath = path.join(folderPath, `.thumbnail-upload-${token}.converted.jpg`);

  await fs.promises.writeFile(inputPath, upload.buffer);
  try {
    await runFfmpeg(
      ['-y', '-i', inputPath, '-frames:v', '1', '-q:v', '2', outputPath],
      { label: 'thumbnail-upload', encoderFallback: false },
    );
    const stat = await fs.promises.stat(outputPath);
    if (!stat.isFile() || stat.size === 0) {
      throw new AppError('Converted thumbnail is empty', 422, 'INVALID_THUMBNAIL_IMAGE');
    }
    return outputPath;
  } catch (error) {
    await fs.promises.rm(outputPath, { force: true }).catch(() => undefined);
    if (error instanceof AppError) throw error;
    const detail = error instanceof Error ? error.message : 'Invalid image';
    throw new AppError(
      `Could not convert thumbnail image: ${detail}`,
      422,
      'INVALID_THUMBNAIL_IMAGE',
    );
  } finally {
    await fs.promises.rm(inputPath, { force: true }).catch(() => undefined);
  }
}

async function replaceThumbnailJpeg(folderPath: string, stagedPath: string): Promise<void> {
  const targetPath = path.join(folderPath, THUMBNAIL_FILENAME);
  const backupPath = path.join(folderPath, `.thumbnail-backup-${randomUUID()}.jpg`);
  const hadTarget = fs.existsSync(targetPath);

  if (hadTarget) {
    await fs.promises.rename(targetPath, backupPath);
  }

  try {
    await fs.promises.rename(stagedPath, targetPath);
    if (hadTarget) {
      await fs.promises.rm(backupPath, { force: true }).catch(() => undefined);
    }
  } catch (error) {
    if (hadTarget && !fs.existsSync(targetPath)) {
      await fs.promises.rename(backupPath, targetPath).catch(() => undefined);
    }
    throw error;
  }
}

export class YoutubeVideoContentService {
  get(channelId: string, videoId: string): YoutubeVideoContent {
    const folderPath = requireViewableVideoFolder(channelId, videoId);
    const raw = readRawMetadata(folderPath);
    const thumbnailPath = findThumbnailPath(folderPath);
    const oldThumbnailPath = findOldThumbnailPath(folderPath);
    let parsed;
    try {
      parsed = parseVideoMetaContent(raw);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Invalid metadata';
      throw new AppError(detail, 422, 'INVALID_VIDEO_METADATA');
    }

    return {
      title: normalizeText(parsed.metadata.title),
      description: normalizeText(parsed.metadata.description),
      tags: normalizeTags(parsed.metadata.tags),
      hasThumbnail: Boolean(thumbnailPath),
      hasOldThumbnail: Boolean(oldThumbnailPath),
      oldThumbnailFolderPath: oldThumbnailPath ? path.dirname(path.resolve(oldThumbnailPath)) : null,
      hasVideo: Boolean(findFinalVideoMp4(folderPath)),
    };
  }

  async update(
    channelId: string,
    videoId: string,
    input: UpdateYoutubeVideoContentInput,
    thumbnail?: YoutubeThumbnailUpload,
  ): Promise<YoutubeVideoContent> {
    const folderPath = requireViewableVideoFolder(channelId, videoId);
    const raw = readRawMetadata(folderPath);
    let stagedThumbnailPath: string | null = null;

    try {
      parseVideoMetaContent(raw);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Invalid metadata';
      throw new AppError(detail, 422, 'INVALID_VIDEO_METADATA');
    }

    try {
      if (thumbnail) {
        stagedThumbnailPath = await stageThumbnailJpeg(folderPath, thumbnail);
      }

      const metadata = getWritableMetadata(raw);
      const tags = normalizeTags(input.tags);
      metadata.title = input.title.trim();
      metadata.description = input.description;
      metadata.tags = tags;
      writeJson(metadataPath(folderPath), raw);
      videoPrepareRepository.updateTitle(channelId, videoId, input.title);

      if (stagedThumbnailPath) {
        await replaceThumbnailJpeg(folderPath, stagedThumbnailPath);
        stagedThumbnailPath = null;
      }

      return this.get(channelId, videoId);
    } finally {
      if (stagedThumbnailPath) {
        await fs.promises.rm(stagedThumbnailPath, { force: true }).catch(() => undefined);
      }
    }
  }

  getAsset(channelId: string, videoId: string, kind: YoutubeVideoAssetKind): YoutubeVideoAsset {
    const folderPath = requireViewableVideoFolder(channelId, videoId);
    const filePath =
      kind === 'video'
        ? findFinalVideoMp4(folderPath)
        : kind === 'old-thumbnail'
          ? findOldThumbnailPath(folderPath)
          : findThumbnailPath(folderPath);

    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new AppError(
        kind === 'video' ? 'Video file not found' : 'Thumbnail not found',
        404,
        kind === 'video' ? 'VIDEO_FILE_NOT_FOUND' : 'THUMBNAIL_NOT_FOUND',
      );
    }

    return {
      filePath,
      contentType: kind === 'video' ? 'video/mp4' : imageContentType(filePath),
      size: fs.statSync(filePath).size,
    };
  }
}

export const youtubeVideoContentService = new YoutubeVideoContentService();
