import fs from 'node:fs';
import path from 'node:path';
import { parseVideoMetaContent } from '../video-production/shared/meta/metadata.types.js';
import { resolveYoutubeChannelVideoDir } from '../../config/paths.js';
import { videoPrepareRepository } from '../youtube-channels/video-prepare.repository.js';
import { findThumbnailPath } from './upload-assets.js';

const VIDEO_META_FILENAME = 'video-meta.json';

export interface UploadJob {
  videoId: string;
  folderPath: string;
  mp4Path: string;
  thumbnailPath: string;
  prepareItemId: string;
}

export interface ListUploadJobsOptions {
  maxUploads?: number | null;
  videoIds?: string[] | null;
  allowOldThumbnail?: boolean;
}

function assertSafeVideoId(videoId: string | undefined | null): string | null {
  if (videoId == null || typeof videoId !== 'string') return null;
  const trimmed = videoId.trim();
  if (!trimmed || trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
    return null;
  }
  return trimmed;
}

function readVideoMetaTitle(folderPath: string): string | null {
  const metaPath = path.join(folderPath, VIDEO_META_FILENAME);

  try {
    const raw = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as unknown;
    const meta = parseVideoMetaContent(raw);
    const title = typeof meta.metadata.title === 'string' ? meta.metadata.title.trim() : '';
    return title || null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[youtube-upload] Failed to read video-meta.json: ${message}`);
    return null;
  }
}

export function listUploadJobs(channelId: string, options: ListUploadJobsOptions = {}): UploadJob[] {
  const createdItems = videoPrepareRepository.listByStatus(channelId, 'Created');
  const filterSet =
    options.videoIds && options.videoIds.length > 0
      ? new Set(options.videoIds.map(id => id.trim().toLowerCase()).filter(Boolean))
      : null;

  const jobs: UploadJob[] = [];

  for (const item of createdItems) {
    const videoId = assertSafeVideoId(item.videoId);
    if (!videoId) {
      console.warn(
        `[youtube-upload] Skip prepare item ${item.id ?? '?'} — missing or invalid videoId`,
      );
      continue;
    }
    if (filterSet && !filterSet.has(videoId.toLowerCase())) continue;

    const folderPath = resolveYoutubeChannelVideoDir(channelId, videoId);
    if (!folderPath) {
      console.warn(
        `[youtube-upload] Skip ${videoId} — folder not found under channel (tried videos/${videoId} and ${videoId})`,
      );
      continue;
    }

    const files = fs.readdirSync(folderPath);
    const mp4File = files.find(file => file.toLowerCase().endsWith('.mp4'));
    if (!mp4File) {
      console.warn(`[youtube-upload] Skip ${videoId} — missing mp4 video file`);
      continue;
    }

    const mp4Path = path.join(folderPath, mp4File);
    const thumbnailPath = findThumbnailPath(folderPath, {
      allowOldThumbnail: options.allowOldThumbnail,
    });
    const metaPath = path.join(folderPath, VIDEO_META_FILENAME);
    if (!thumbnailPath) {
      const expectedThumbnail = options.allowOldThumbnail
        ? 'thumbnail.* or old-thumbnail.*'
        : 'thumbnail.*';
      console.warn(`[youtube-upload] Skip ${videoId} — missing thumbnail (${expectedThumbnail})`);
      continue;
    }
    if (!fs.existsSync(metaPath)) {
      console.warn(`[youtube-upload] Skip ${videoId} — missing video-meta.json`);
      continue;
    }

    const title = readVideoMetaTitle(folderPath);
    if (!title) {
      console.warn(`[youtube-upload] Skip ${videoId} — missing title in video-meta.json`);
      continue;
    }

    jobs.push({
      videoId,
      folderPath,
      mp4Path,
      thumbnailPath,
      prepareItemId: item.id,
    });

    const max = options.maxUploads;
    if (max != null && Number.isFinite(max) && max > 0 && jobs.length >= max) {
      break;
    }
  }

  return jobs;
}
