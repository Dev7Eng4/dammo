import { paths } from '../../config/paths.js';
import { readJson, updateJson, writeJson } from '../../infrastructure/storage/json-store.js';
import { isUuid } from '../../shared/id.js';
import { normalizeChannelLanguage } from './channel-language.js';
import {
  normalizeChannelStatus,
  normalizeYoutubeChannel,
  channelNeedsMigration,
} from './youtube-channel-migration.js';
import type { YoutubeChannel, YoutubeChannelsStore } from './youtube-channels.types.js';

const EMPTY_STORE: YoutubeChannelsStore = { channels: [] };

type LegacyYoutubeChannelsStore = YoutubeChannelsStore & { nextId?: number };
type LegacyYoutubeChannel = YoutubeChannel & {
  sourceMapping?: string;
  backgroundFootageSourceId?: string;
};

function needsLegacyMigration(raw: LegacyYoutubeChannelsStore): boolean {
  return (
    raw.nextId !== undefined ||
    raw.channels.some((c) => !isUuid(c.id)) ||
    raw.channels.some((c) => channelNeedsMigration(c as LegacyYoutubeChannel))
  );
}

function migrateStore(raw: LegacyYoutubeChannelsStore): YoutubeChannelsStore {
  const channels = raw.channels.map(channel => normalizeYoutubeChannel(channel as LegacyYoutubeChannel));
  const store = { channels };
  writeJson(paths.youtubeChannels, store);
  return store;
}

function hydrateChannel(channel: YoutubeChannel): YoutubeChannel {
  return {
    ...channel,
    language: normalizeChannelLanguage(channel.language),
    status: normalizeChannelStatus(channel.status),
  };
}

function loadStore(): YoutubeChannelsStore {
  const raw = readJson<LegacyYoutubeChannelsStore>(paths.youtubeChannels);
  if (!raw || !Array.isArray(raw.channels)) return EMPTY_STORE;
  if (needsLegacyMigration(raw)) return migrateStore(raw);
  return { channels: raw.channels };
}

export class YoutubeChannelsRepository {
  findAll(options?: { includeDeleted?: boolean }): YoutubeChannel[] {
    const channels = loadStore().channels.map(hydrateChannel);
    if (options?.includeDeleted) return channels;
    return channels.filter((channel) => channel.status !== 'deleted');
  }

  findById(id: string): YoutubeChannel | null {
    const channel = loadStore().channels.find((c) => c.id === id) ?? null;
    if (!channel) return null;
    return hydrateChannel(channel);
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

        updated = updater(hydrateChannel(store.channels[index]));
        const channels = [...store.channels];
        channels[index] = updated;
        return { channels };
      },
      loadStore(),
    );

    return updated;
  }

  /** Soft-delete: mark status deleted (keeps row in store). */
  remove(id: string): boolean {
    const updated = this.update(id, (channel) => ({
      ...channel,
      status: 'deleted',
    }));
    return updated != null;
  }
}

export const youtubeChannelsRepository = new YoutubeChannelsRepository();
