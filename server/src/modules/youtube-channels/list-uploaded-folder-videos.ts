import fs from 'node:fs';
import path from 'node:path';
import { youtubeChannelUploadsDir, youtubeChannelUploadedVideoDir } from '../../config/paths.js';
import type { YoutubeChannelVideo } from '../../infrastructure/youtube/youtube-channel.types.js';
import { readJson } from '../../infrastructure/storage/json-store.js';
import { videoPrepareRepository } from './video-prepare.repository.js';

const VIDEO_META_FILENAME = 'video-meta.json';

function readTitleFromVideoMeta(folderPath: string): string | null {
  const metaPath = path.join(folderPath, VIDEO_META_FILENAME);
  if (!fs.existsSync(metaPath)) return null;

  try {
    const raw = readJson<unknown>(metaPath);
    if (!raw || typeof raw !== 'object') return null;

    const metadata = (raw as Record<string, unknown>).metadata;
    if (!metadata || typeof metadata !== 'object') return null;

    const title = (metadata as Record<string, unknown>).title;
    if (typeof title === 'string' && title.trim()) return title.trim();
  } catch {
    // ignore malformed meta
  }

  return null;
}

function buildPrepareTitleMap(channelId: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of videoPrepareRepository.read(channelId)) {
    const videoId = item.videoId.trim();
    if (videoId && item.title.trim()) {
      map.set(videoId, item.title.trim());
    }
  }
  return map;
}

export function listUploadedFolderVideos(channelId: string): YoutubeChannelVideo[] {
  const uploadsDir = youtubeChannelUploadsDir(channelId);
  if (!fs.existsSync(uploadsDir)) return [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(uploadsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const prepareTitles = buildPrepareTitleMap(channelId);
  const videos: YoutubeChannelVideo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const videoId = entry.name.trim();
    if (!videoId || videoId.includes('..')) continue;

    const folderPath = youtubeChannelUploadedVideoDir(channelId, videoId);
    const title =
      readTitleFromVideoMeta(folderPath) ??
      prepareTitles.get(videoId) ??
      videoId;

    videos.push({
      id: videoId,
      title,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    });
  }

  return videos;
}
