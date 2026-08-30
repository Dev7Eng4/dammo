import fs from 'node:fs';
import path from 'node:path';
import { recreateMetadataDir } from '../../config/paths.js';
import { readJson } from '../../infrastructure/storage/json-store.js';
import { AppError } from '../../shared/http/errors.js';
import { parseVideoMetaContent } from '../video-production/shared/meta/metadata.types.js';
import { findOldThumbnailPath, findThumbnailPath } from '../youtube-upload/upload-assets.js';
import { youtubeChannelsRepository } from './youtube-channels.repository.js';
import type { YoutubeVideoAsset, YoutubeVideoAssetKind, YoutubeVideoContent } from './youtube-video-content.service.js';

const VIDEO_META_FILENAME = 'video-meta.json';

function assertChannelExists(channelId: string): void {
  if (!youtubeChannelsRepository.findById(channelId)) {
    throw new AppError('Channel not found', 404, 'NOT_FOUND');
  }
}

function requireRecreateMetadataFolder(): string {
  const folderPath = recreateMetadataDir();
  if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
    throw new AppError('Recreate metadata folder not found', 404, 'RECREATE_METADATA_NOT_FOUND');
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

export class YoutubeRecreateMetadataService {
  getContent(channelId: string): YoutubeVideoContent {
    assertChannelExists(channelId);
    const folderPath = requireRecreateMetadataFolder();
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
      videoFolderPath: path.resolve(folderPath),
      hasVideo: false,
    };
  }

  getAsset(channelId: string, kind: YoutubeVideoAssetKind): YoutubeVideoAsset {
    assertChannelExists(channelId);
    const folderPath = requireRecreateMetadataFolder();

    if (kind === 'video') {
      throw new AppError('Video file not found', 404, 'VIDEO_FILE_NOT_FOUND');
    }

    const filePath =
      kind === 'old-thumbnail' ? findOldThumbnailPath(folderPath) : findThumbnailPath(folderPath);

    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new AppError('Thumbnail not found', 404, 'THUMBNAIL_NOT_FOUND');
    }

    return {
      filePath,
      contentType: imageContentType(filePath),
      size: fs.statSync(filePath).size,
    };
  }
}

export const youtubeRecreateMetadataService = new YoutubeRecreateMetadataService();
