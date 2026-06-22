import fs from 'node:fs';
import { youtubeChannelDir, youtubeChannelVideoPrepareFile } from '../../config/paths.js';
import { readJson, writeJson } from '../../infrastructure/storage/json-store.js';
import type { VideoPrepareItem, VideoPrepareStatus } from './video-prepare.types.js';

export class VideoPrepareRepository {
  read(channelId: string): VideoPrepareItem[] {
    const items = readJson<VideoPrepareItem[]>(youtubeChannelVideoPrepareFile(channelId));
    return Array.isArray(items) ? items : [];
  }

  ensureStore(channelId: string): VideoPrepareItem[] {
    const file = youtubeChannelVideoPrepareFile(channelId);
    if (fs.existsSync(file)) {
      return this.read(channelId);
    }

    fs.mkdirSync(youtubeChannelDir(channelId), { recursive: true });
    writeJson(file, []);
    return [];
  }

  appendCreated(channelId: string, item: VideoPrepareItem): VideoPrepareItem[] {
    this.ensureStore(channelId);
    const items = [...this.read(channelId), item];
    writeJson(youtubeChannelVideoPrepareFile(channelId), items);
    return items;
  }

  getPreparedVideoIds(channelId: string): Set<string> {
    return new Set(
      this.read(channelId)
        .map(item => item.videoId.trim())
        .filter(Boolean),
    );
  }

  listByStatus(channelId: string, status: VideoPrepareStatus): VideoPrepareItem[] {
    return this.read(channelId).filter(item => item.status === status);
  }

  countByStatus(channelId: string, status: VideoPrepareStatus): number {
    return this.listByStatus(channelId, status).length;
  }

  updateStatus(channelId: string, videoId: string, status: VideoPrepareStatus): VideoPrepareItem | null {
    const normalizedVideoId = videoId.trim();
    if (!normalizedVideoId) return null;

    let updated: VideoPrepareItem | null = null;
    const items = this.read(channelId).map(item => {
      if (item.videoId.trim() !== normalizedVideoId) return item;
      updated = { ...item, status };
      return updated;
    });

    if (!updated) return null;
    writeJson(youtubeChannelVideoPrepareFile(channelId), items);
    return updated;
  }

  markCreated(channelId: string, videoId: string): VideoPrepareItem | null {
    return this.updateStatus(channelId, videoId, 'Created');
  }

  markUploaded(channelId: string, videoId: string): VideoPrepareItem | null {
    return this.updateStatus(channelId, videoId, 'Uploaded');
  }
}

export const videoPrepareRepository = new VideoPrepareRepository();
