import { paths } from '../../config/paths.js';
import { readJson, writeJson } from '../../infrastructure/storage/json-store.js';
import type { RadarStore } from './radar.types.js';

export function todayUtc(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function emptyStore(): RadarStore {
  return { videos: {}, baselines: {}, quota: { date: todayUtc(), used: 0 } };
}

export class RadarRepository {
  read(): RadarStore {
    const store = readJson<RadarStore>(paths.radarStore) ?? emptyStore();
    // The quota counter resets every UTC day (YouTube resets at midnight Pacific; this is a safe approximation).
    if (store.quota.date !== todayUtc()) store.quota = { date: todayUtc(), used: 0 };
    return store;
  }

  write(store: RadarStore): void {
    writeJson(paths.radarStore, store);
  }
}

export const radarRepository = new RadarRepository();
