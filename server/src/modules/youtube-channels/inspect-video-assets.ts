import fs from 'node:fs';
import path from 'node:path';
import { resolveYoutubeChannelVideoDir } from '../../config/paths.js';
import { readJson } from '../../infrastructure/storage/json-store.js';
import { parseVideoMetaContent } from '../video-production/shared/meta/metadata.types.js';
import { findThumbnailPath } from '../youtube-upload/upload-assets.js';
import type { YoutubeChannelVideo } from '../../infrastructure/youtube/youtube-channel.types.js';

const VIDEO_META_FILENAME = 'video-meta.json';

function hasMetadataTitle(folderPath: string): boolean {
  try {
    const raw = readJson<unknown>(path.join(folderPath, VIDEO_META_FILENAME));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
    const { metadata } = parseVideoMetaContent(raw as Record<string, unknown>);
    return typeof metadata.title === 'string' && metadata.title.trim().length > 0;
  } catch {
    return false;
  }
}

function hasThumbnail(folderPath: string): boolean {
  try {
    return Boolean(findThumbnailPath(folderPath));
  } catch {
    return false;
  }
}

/**
 * Prepared/Created videos are expected to have both a title and a thumbnail in their
 * local folder. Returns true when either one is missing.
 */
export function isMissingTitleOrThumbnail(channelId: string, video: YoutubeChannelVideo): boolean {
  if (video.status !== 'Prepared' && video.status !== 'Created') return false;
  const folderPath = resolveYoutubeChannelVideoDir(channelId, video.id);
  if (!folderPath || !fs.existsSync(folderPath)) return true;
  return !video.title.trim() || !hasMetadataTitle(folderPath) || !hasThumbnail(folderPath);
}
