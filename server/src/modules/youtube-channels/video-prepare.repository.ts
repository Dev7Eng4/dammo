import fs from 'node:fs';
import { youtubeChannelDir, youtubeChannelVideoPrepareFile } from '../../config/paths.js';
import { readJson, writeJson } from '../../infrastructure/storage/json-store.js';
import type { VideoPrepareItem } from './reup-video.types.js';

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
}

export const videoPrepareRepository = new VideoPrepareRepository();
