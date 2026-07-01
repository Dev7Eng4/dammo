import fs from 'node:fs';
import {
  legacySourceVideosFile,
  sourceChannelDir,
  sourceChannelVideosFile,
} from '../../config/paths.js';
import { readJson, writeJson } from '../../infrastructure/storage/json-store.js';
import type { YoutubeChannelVideo } from '../../infrastructure/youtube/youtube-channel.types.js';
import { AppError } from '../../shared/http/errors.js';
import type { SourceVideoRecord, SourceVideosStore } from './source-channels.types.js';

function migrateLegacyFileIfNeeded(sourceId: string): void {
  const legacyFile = legacySourceVideosFile(sourceId);
  const newFile = sourceChannelVideosFile(sourceId);

  if (!fs.existsSync(legacyFile) || fs.existsSync(newFile)) {
    return;
  }

  fs.mkdirSync(sourceChannelDir(sourceId), { recursive: true });
  fs.renameSync(legacyFile, newFile);
}

export class SourceVideosRepository {
  exists(sourceId: string): boolean {
    migrateLegacyFileIfNeeded(sourceId);
    return fs.existsSync(sourceChannelVideosFile(sourceId));
  }

  read(sourceId: string): SourceVideosStore | null {
    migrateLegacyFileIfNeeded(sourceId);
    return readJson<SourceVideosStore>(sourceChannelVideosFile(sourceId));
  }

  write(sourceId: string, store: SourceVideosStore): SourceVideosStore {
    fs.mkdirSync(sourceChannelDir(sourceId), { recursive: true });
    writeJson(sourceChannelVideosFile(sourceId), store);
    return store;
  }

  incrementVideoUsed(sourceId: string, videoId: string): number {
    const store = this.read(sourceId);
    if (!store) {
      throw new AppError(`Source videos not found: ${sourceId}`, 404, 'SOURCE_VIDEOS_NOT_FOUND');
    }

    const video = store.videos.find(v => v.id === videoId);
    if (!video) {
      throw new AppError(`Video not found in source ${sourceId}: ${videoId}`, 404, 'SOURCE_VIDEO_NOT_FOUND');
    }

    const nextUsed = (video.used ?? 0) + 1;
    video.used = nextUsed;
    this.write(sourceId, store);
    return nextUsed;
  }

  markVideoDownloaded(sourceId: string, videoId: string): void {
    const store = this.read(sourceId);
    if (!store) {
      throw new AppError(`Source videos not found: ${sourceId}`, 404, 'SOURCE_VIDEOS_NOT_FOUND');
    }

    const video = store.videos.find(v => v.id === videoId);
    if (!video) {
      throw new AppError(`Video not found in source ${sourceId}: ${videoId}`, 404, 'SOURCE_VIDEO_NOT_FOUND');
    }

    video.status = 'Downloaded';
    this.write(sourceId, store);
  }

  mergeVideosOnRefresh(
    sourceId: string,
    freshVideos: YoutubeChannelVideo[],
    channelId?: string,
  ): SourceVideosStore {
    const existing = this.read(sourceId);
    const previousById = new Map(
      (existing?.videos ?? []).map(video => [video.id, video]),
    );

    const merged: SourceVideoRecord[] = freshVideos.map(video => {
      const previous = previousById.get(video.id);
      return {
        ...video,
        used: previous?.used,
        status: previous?.status,
      };
    });

    const store: SourceVideosStore = {
      sourceId,
      channelId: channelId ?? existing?.channelId,
      fetchedAt: new Date().toISOString(),
      videos: merged,
    };

    return this.write(sourceId, store);
  }

  delete(sourceId: string): void {
    migrateLegacyFileIfNeeded(sourceId);

    const legacyFile = legacySourceVideosFile(sourceId);
    if (fs.existsSync(legacyFile)) {
      fs.unlinkSync(legacyFile);
    }

    const dir = sourceChannelDir(sourceId);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

export const sourceVideosRepository = new SourceVideosRepository();
