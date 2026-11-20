import { paths } from '../../config/paths.js';
import { readJson, writeJson } from '../../infrastructure/storage/json-store.js';
import {
  fetchChannelMetrics,
  fetchChannelStatistics,
  type ApiChannelStatistics,
  type ChannelMetrics,
  type ChannelRef,
} from '../../infrastructure/youtube/youtube-channel-metrics.js';
import { AppError, isAppError } from '../../shared/http/errors.js';
import { youtubeChannelsRepository } from './youtube-channels.repository.js';
import type { YoutubeChannel } from './youtube-channels.types.js';

/**
 * Per-channel YouTube Data API v3 key, kept in its own file (data/youtube-api-keys.json) so the raw
 * key never rides along in channel API responses. Read by the "Chỉ số kênh" brain via
 * `getChannelMetrics`.
 */

interface StoredKey {
  apiKey: string;
  updatedAt: string;
  status?: 'ok' | 'invalid' | 'quota_exceeded' | 'error';
  statusMessage?: string;
  lastCheckedAt?: string;
  /** Channel title the key last resolved to (display only). */
  channelTitle?: string;
}

type KeyStore = Record<string, StoredKey>;

export interface YoutubeApiKeyStatus {
  configured: boolean;
  maskedKey?: string;
  updatedAt?: string;
  status?: StoredKey['status'];
  statusMessage?: string;
  lastCheckedAt?: string;
  channelTitle?: string;
}

export interface YoutubeApiKeyTestResult {
  ok: boolean;
  channel?: ApiChannelStatistics;
  error?: string;
  code?: string;
}

function readStore(): KeyStore {
  return readJson<KeyStore>(paths.youtubeApiKeys) ?? {};
}

function writeStore(store: KeyStore): void {
  writeJson(paths.youtubeApiKeys, store);
}

export function maskYoutubeApiKey(apiKey: string): string {
  return apiKey.length <= 8 ? '••••' : `${apiKey.slice(0, 4)}••••${apiKey.slice(-4)}`;
}

function toStatus(stored: StoredKey | undefined): YoutubeApiKeyStatus {
  if (!stored) return { configured: false };
  const { apiKey, ...rest } = stored;
  return { configured: true, maskedKey: maskYoutubeApiKey(apiKey), ...rest };
}

function requireChannel(id: string): YoutubeChannel {
  const channel = youtubeChannelsRepository.findById(id);
  if (!channel) throw new AppError('Không tìm thấy kênh', 404, 'YOUTUBE_CHANNEL_NOT_FOUND');
  return channel;
}

/** How to find a stored channel on the Data API: its UC id, else its @handle. */
export function channelRefOf(channel: Pick<YoutubeChannel, 'channelId' | 'handle' | 'youtubeUrl'>): ChannelRef {
  const handle = channel.handle?.startsWith('@')
    ? channel.handle
    : /youtube\.com\/(@[\w.-]+)/i.exec(channel.youtubeUrl ?? '')?.[1];
  return { channelId: channel.channelId, handle };
}

function classifyCode(code: string | undefined): NonNullable<StoredKey['status']> {
  if (code === 'YOUTUBE_API_KEY_INVALID') return 'invalid';
  if (code === 'YOUTUBE_API_QUOTA_EXCEEDED') return 'quota_exceeded';
  return 'error';
}

function classify(err: unknown): NonNullable<StoredKey['status']> {
  return classifyCode(isAppError(err) ? err.code : undefined);
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const youtubeApiKeyService = {
  getStatus(channelId: string): YoutubeApiKeyStatus {
    requireChannel(channelId);
    return toStatus(readStore()[channelId]);
  },

  /** The raw key for server-side callers (brains, sync). undefined when the channel has none. */
  getApiKey(channelId: string): string | undefined {
    return readStore()[channelId]?.apiKey;
  },

  /**
   * Checks a key with one channels.list call (1 quota unit). With a channel ref the call also proves
   * the channel is reachable; without one it only proves the key works.
   */
  async test(apiKey: string, ref?: ChannelRef): Promise<YoutubeApiKeyTestResult> {
    try {
      const target = ref && (ref.channelId || ref.handle) ? ref : { handle: '@YouTube' };
      const channel = await fetchChannelStatistics(target, apiKey);
      if (!channel && ref && (ref.channelId || ref.handle)) {
        return { ok: true, error: 'Key hợp lệ nhưng không tìm thấy kênh theo channel id / @handle', code: 'YOUTUBE_CHANNEL_NOT_FOUND' };
      }
      return { ok: true, channel: ref && (ref.channelId || ref.handle) ? channel ?? undefined : undefined };
    } catch (err) {
      return { ok: false, error: errorText(err), code: isAppError(err) ? err.code : undefined };
    }
  },

  /** Verifies the key against the channel, then saves it. A key the API rejects is not saved. */
  async setKey(channelId: string, apiKey: string): Promise<YoutubeApiKeyStatus> {
    const channel = requireChannel(channelId);
    const ref = channelRefOf(channel);
    const hasRef = Boolean(ref.channelId || ref.handle);
    const result = await this.test(apiKey, hasRef ? ref : undefined);
    if (!result.ok && classifyCode(result.code) === 'invalid') {
      throw new AppError(result.error ?? 'API key không hợp lệ', 400, 'YOUTUBE_API_KEY_INVALID');
    }
    const now = new Date().toISOString();
    const stored: StoredKey = {
      apiKey,
      updatedAt: now,
      lastCheckedAt: now,
      status: result.ok ? 'ok' : classifyCode(result.code),
      statusMessage: result.error,
      channelTitle: result.channel?.title,
    };
    const store = readStore();
    store[channelId] = stored;
    writeStore(store);

    // Fill in the UC id when the channel only had a handle, so later calls skip the lookup.
    if (result.channel && !channel.channelId) {
      youtubeChannelsRepository.update(channelId, current => ({ ...current, channelId: result.channel!.channelId }));
    }
    return toStatus(stored);
  },

  removeKey(channelId: string): void {
    const store = readStore();
    if (!store[channelId]) return;
    delete store[channelId];
    writeStore(store);
  },

  async checkKey(channelId: string): Promise<YoutubeApiKeyStatus> {
    const channel = requireChannel(channelId);
    const store = readStore();
    const stored = store[channelId];
    if (!stored) return { configured: false };
    const result = await this.test(stored.apiKey, channelRefOf(channel));
    store[channelId] = {
      ...stored,
      lastCheckedAt: new Date().toISOString(),
      status: result.ok ? 'ok' : classifyCode(result.code),
      statusMessage: result.error,
      channelTitle: result.channel?.title ?? stored.channelTitle,
    };
    writeStore(store);
    return toStatus(store[channelId]);
  },

  /**
   * Channel totals + latest uploads with views / likes / comments, using the channel's own key
   * (falls back to the YOUTUBE_API_KEY env when the channel has none).
   */
  async getChannelMetrics(channelId: string, maxVideos = 50): Promise<ChannelMetrics> {
    const channel = requireChannel(channelId);
    const apiKey = this.getApiKey(channelId);
    try {
      return await fetchChannelMetrics(channelRefOf(channel), { apiKey, maxVideos });
    } catch (err) {
      if (apiKey) {
        const store = readStore();
        if (store[channelId]) {
          store[channelId] = {
            ...store[channelId],
            lastCheckedAt: new Date().toISOString(),
            status: classify(err),
            statusMessage: errorText(err),
          };
          writeStore(store);
        }
      }
      throw err;
    }
  },
};
