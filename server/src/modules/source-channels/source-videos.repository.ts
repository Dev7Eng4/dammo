import fs from 'node:fs';
import { sourceVideosFile } from '../../config/paths.js';
import { readJson, writeJson } from '../../infrastructure/storage/json-store.js';
import { AppError } from '../../shared/http/errors.js';
import type { SourceVideosStore } from './source-channels.types.js';

export class SourceVideosRepository {
  exists(sourceId: string): boolean {
    return fs.existsSync(sourceVideosFile(sourceId));
  }

  read(sourceId: string): SourceVideosStore | null {
    return readJson<SourceVideosStore>(sourceVideosFile(sourceId));
  }

  write(sourceId: string, store: SourceVideosStore): SourceVideosStore {
    writeJson(sourceVideosFile(sourceId), store);
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

  delete(sourceId: string): void {
    const file = sourceVideosFile(sourceId);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }
}

export const sourceVideosRepository = new SourceVideosRepository();
