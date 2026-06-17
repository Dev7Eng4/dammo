import { paths } from '../../config/paths.js';
import { readJson, updateJson, writeJson } from '../../infrastructure/storage/json-store.js';
import { isUuid } from '../../shared/id.js';
import { generateSeedChannels } from './youtube-channels.seed.js';
import type { YoutubeChannel, YoutubeChannelsStore } from './youtube-channels.types.js';

const EMPTY_STORE: YoutubeChannelsStore = { channels: [] };

type LegacyYoutubeChannelsStore = YoutubeChannelsStore & { nextId?: number };

function isCurrentSchema(channel: Partial<YoutubeChannel>): channel is YoutubeChannel {
  return (
    typeof channel.handle === 'string' &&
    typeof channel.type === 'string' &&
    typeof channel.monetizationStatus === 'string' &&
    typeof channel.linkedEmail === 'string' &&
    Array.isArray(channel.recentActivity)
  );
}

function needsReseed(raw: LegacyYoutubeChannelsStore | null): boolean {
  if (!raw?.channels?.length) return true;
  if (raw.nextId !== undefined) return true;
  if (raw.channels.some((c) => !isUuid(c.id))) return true;
  if (!raw.channels.every(isCurrentSchema)) return true;
  return false;
}

function loadStore(): YoutubeChannelsStore {
  const raw = readJson<LegacyYoutubeChannelsStore>(paths.youtubeChannels);
  if (needsReseed(raw)) {
    const seeded = generateSeedChannels();
    writeJson(paths.youtubeChannels, seeded);
    return seeded;
  }
  return raw ?? EMPTY_STORE;
}

export class YoutubeChannelsRepository {
  findAll(): YoutubeChannel[] {
    return loadStore().channels;
  }

  findById(id: string): YoutubeChannel | null {
    return loadStore().channels.find((c) => c.id === id) ?? null;
  }

  prepend(channel: YoutubeChannel): YoutubeChannel {
    updateJson(
      paths.youtubeChannels,
      (store) => ({
        channels: [channel, ...store.channels],
      }),
      loadStore(),
    );
    return channel;
  }

  update(id: string, updater: (channel: YoutubeChannel) => YoutubeChannel): YoutubeChannel | null {
    let updated: YoutubeChannel | null = null;

    updateJson(
      paths.youtubeChannels,
      (store) => {
        const index = store.channels.findIndex((c) => c.id === id);
        if (index === -1) return store;

        updated = updater(store.channels[index]);
        const channels = [...store.channels];
        channels[index] = updated;
        return { channels };
      },
      loadStore(),
    );

    return updated;
  }
}

export const youtubeChannelsRepository = new YoutubeChannelsRepository();
