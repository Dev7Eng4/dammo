import fs from 'node:fs';
import { youtubeChannelDir, youtubeChannelVideosFile } from '../../config/paths.js';
import { readJson, writeJson } from '../../infrastructure/storage/json-store.js';
import type { YoutubeChannelVideosStore } from './youtube-channels.types.js';

export class YoutubeChannelVideosRepository {
  exists(channelId: string): boolean {
    return fs.existsSync(youtubeChannelVideosFile(channelId));
  }

  read(channelId: string): YoutubeChannelVideosStore | null {
    return readJson<YoutubeChannelVideosStore>(youtubeChannelVideosFile(channelId));
  }

  write(channelId: string, store: YoutubeChannelVideosStore): YoutubeChannelVideosStore {
    fs.mkdirSync(youtubeChannelDir(channelId), { recursive: true });
    writeJson(youtubeChannelVideosFile(channelId), store);
    return store;
  }

  delete(channelId: string): void {
    const file = youtubeChannelVideosFile(channelId);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }
}

export const youtubeChannelVideosRepository = new YoutubeChannelVideosRepository();
