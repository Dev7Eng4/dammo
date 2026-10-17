import { paths } from '../../config/paths.js';
import { updateJson } from '../../infrastructure/storage/json-store.js';

export interface OverviewSnapshot {
  youtubeChannels: number;
  tiktokAccounts: number;
  facebookAssets: number;
  sourceChannels: number;
}

type SnapshotStore = Record<string, OverviewSnapshot>;

const MAX_DAYS_KEPT = 90;

function localDateKey(date = new Date()): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

export class DashboardSnapshotsRepository {
  /** Upserts today's snapshot (last write of the day wins) and returns the store. */
  record(snapshot: OverviewSnapshot): SnapshotStore {
    const today = localDateKey();
    return updateJson<SnapshotStore>(
      paths.dashboardSnapshots,
      (current) => {
        const next: SnapshotStore = { ...current, [today]: snapshot };
        const keys = Object.keys(next).sort();
        for (const key of keys.slice(0, Math.max(0, keys.length - MAX_DAYS_KEPT))) {
          delete next[key];
        }
        return next;
      },
      {},
    );
  }

  /** Per-metric series (oldest → newest) for the most recent `days` snapshots. */
  getTrends(snapshot: OverviewSnapshot, days = 14): Record<keyof OverviewSnapshot, number[]> {
    const store = this.record(snapshot);
    const recent = Object.keys(store)
      .sort()
      .slice(-days)
      .map((key) => store[key]);

    return {
      youtubeChannels: recent.map((s) => s.youtubeChannels),
      tiktokAccounts: recent.map((s) => s.tiktokAccounts),
      facebookAssets: recent.map((s) => s.facebookAssets),
      sourceChannels: recent.map((s) => s.sourceChannels),
    };
  }
}

export const dashboardSnapshotsRepository = new DashboardSnapshotsRepository();
