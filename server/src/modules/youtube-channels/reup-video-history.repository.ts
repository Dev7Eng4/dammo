import { paths } from '../../config/paths.js';
import { readJson, updateJson } from '../../infrastructure/storage/json-store.js';
import type { ReupVideoHistoryRecord, ReupVideoHistoryStore } from './reup-video.types.js';

const EMPTY_STORE: ReupVideoHistoryStore = { records: [] };

function loadStore(): ReupVideoHistoryStore {
  return readJson<ReupVideoHistoryStore>(paths.reupVideoHistory) ?? EMPTY_STORE;
}

function normalizeUrl(url: string): string {
  return url.trim().toLowerCase();
}

export class ReupVideoHistoryRepository {
  getProcessedVideoUrls(channelId: string): Set<string> {
    const urls = loadStore()
      .records.filter((record) => record.channelId === channelId)
      .map((record) => normalizeUrl(record.videoUrl));
    return new Set(urls);
  }

  markProcessed(record: ReupVideoHistoryRecord): ReupVideoHistoryRecord {
    updateJson(
      paths.reupVideoHistory,
      (store) => ({
        records: [record, ...store.records],
      }),
      loadStore(),
    );
    return record;
  }
}

export const reupVideoHistoryRepository = new ReupVideoHistoryRepository();
