import fs from 'node:fs';
import path from 'node:path';
import { SI_OUTPUT_VIDEO_BASENAME } from '../video-production/shared/si-video/si.constants.js';
import { parseVideoMetaContent } from '../video-production/shared/meta/metadata.types.js';
import { youtubeChannelVideoDir } from '../../config/paths.js';
import { videoPrepareRepository } from '../youtube-channels/video-prepare.repository.js';

const VIDEO_META_FILENAME = 'video-meta.json';
const THUMBNAIL_FILENAME = 'thumbnail.jpg';

export interface UploadJob {
  videoId: string;
  folderPath: string;
  mp4Path: string;
  prepareItemId: string;
}

export interface ListUploadJobsOptions {
  maxUploads?: number | null;
  videoIds?: string[] | null;
}

function assertSafeVideoId(videoId: string): string | null {
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
    if (!videoId) continue;
    if (filterSet && !filterSet.has(videoId.toLowerCase())) continue;

    const folderPath = youtubeChannelVideoDir(channelId, videoId);
    const mp4Path = path.join(folderPath, `${SI_OUTPUT_VIDEO_BASENAME}.mp4`);
    const thumbnailPath = path.join(folderPath, THUMBNAIL_FILENAME);
    const metaPath = path.join(folderPath, VIDEO_META_FILENAME);

    if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
      console.warn(`[youtube-upload] Skip ${videoId} — folder not found: ${folderPath}`);
      continue;
    }
    if (!fs.existsSync(mp4Path)) {
      console.warn(`[youtube-upload] Skip ${videoId} — missing video.mp4`);
      continue;
    }
    if (!fs.existsSync(thumbnailPath)) {
      console.warn(`[youtube-upload] Skip ${videoId} — missing thumbnail.jpg`);
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
      prepareItemId: item.id,
    });

    const max = options.maxUploads;
    if (max != null && Number.isFinite(max) && max > 0 && jobs.length >= max) {
      break;
    }
  }

  return jobs;
}
