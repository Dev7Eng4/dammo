import { env } from '../../config/env.js';
import {
  fetchRecentUploads,
  isYoutubeDataApiConfigured,
  type ApiVideo,
} from '../../infrastructure/youtube/youtube-data-api.js';
import { AppError, isAppError } from '../../shared/http/errors.js';
import { sourceChannelsRepository } from '../source-channels/source-channels.repository.js';
import type { SourceChannel } from '../source-channels/source-channels.types.js';
import { classifyTier, computeChannelBaseline, expectedViewsAtAge } from './radar-scoring.js';
import { radarRepository } from './radar.repository.js';
import type { RadarItem, RadarScanResult, RadarStore } from './radar.types.js';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Videos older than this stop being tracked individually (they only feed the channel baseline). */
const TRACK_DAYS = 45;
const MAX_SNAPSHOTS_PER_VIDEO = 60;
const MIN_FEED_AGE_HOURS = 1;
/** A channel costs 2 units (playlistItems + videos); stop before exceeding the soft cap. */
const UNITS_PER_CHANNEL = 2;

export interface RadarListOptions {
  /** Only videos at most this old (hours). Default 168 (7 days). */
  maxAgeHours?: number;
  minViews?: number;
  /** Skip Shorts (anything under this many seconds). Default 61. */
  minDurationSeconds?: number;
  minRatio?: number;
  limit?: number;
}

function scannableSources(): SourceChannel[] {
  return sourceChannelsRepository.findAll().filter(s => s.platform === 'youtube' && Boolean(s.channelId));
}

function recordVideos(store: RadarStore, source: SourceChannel, nowIso: string, videos: ApiVideo[]): void {
  for (const video of videos) {
    const snapshots = store.videos[video.id]?.snapshots ?? [];
    snapshots.push({ at: nowIso, views: video.viewCount });
    store.videos[video.id] = {
      id: video.id,
      sourceId: source.id,
      channelId: video.channelId,
      title: video.title,
      url: `https://www.youtube.com/watch?v=${video.id}`,
      publishedAt: video.publishedAt,
      durationSeconds: video.durationSeconds,
      snapshots: snapshots.slice(-MAX_SNAPSHOTS_PER_VIDEO),
    };
  }
}

function pruneOldVideos(store: RadarStore, now: number): void {
  for (const [id, video] of Object.entries(store.videos)) {
    if (now - Date.parse(video.publishedAt) > TRACK_DAYS * DAY_MS) delete store.videos[id];
  }
}

export class RadarService {
  private scanning = false;

  isScanning(): boolean {
    return this.scanning;
  }

  /** Runs one scan; manual and scheduled scans share this guard so they never overlap. */
  async scan(): Promise<RadarScanResult> {
    if (!isYoutubeDataApiConfigured()) {
      throw new AppError('YOUTUBE_API_KEY is not configured', 503, 'YOUTUBE_API_KEY_MISSING');
    }
    if (this.scanning) {
      throw new AppError('A radar scan is already running', 409, 'RADAR_SCAN_IN_PROGRESS');
    }

    this.scanning = true;
    try {
      return await this.runScan();
    } finally {
      this.scanning = false;
    }
  }

  private async runScan(): Promise<RadarScanResult> {
    const store = radarRepository.read();
    const cap = env.youtubeApiDailyQuotaCap;
    const result: RadarScanResult = {
      scannedChannels: 0,
      skippedChannels: 0,
      failedChannels: [],
      quotaUsedThisScan: 0,
      quotaUsedToday: store.quota.used,
      quotaCap: cap,
      stoppedForQuota: false,
    };

    for (const source of scannableSources()) {
      if (store.quota.used + UNITS_PER_CHANNEL > cap) {
        result.stoppedForQuota = true;
        result.skippedChannels += 1;
        continue;
      }

      try {
        const { videos, quotaUnits } = await fetchRecentUploads(source.channelId as string);
        store.quota.used += quotaUnits;
        result.quotaUsedThisScan += quotaUnits;

        const now = Date.now();
        const nowIso = new Date(now).toISOString();
        recordVideos(store, source, nowIso, videos);

        const baseline = computeChannelBaseline(
          videos.map(v => ({ views: v.viewCount, ageDays: (now - Date.parse(v.publishedAt)) / DAY_MS })),
        );
        if (baseline) {
          store.baselines[source.id] = {
            sourceId: source.id,
            baselineViews: baseline.baselineViews,
            matureVideoCount: baseline.matureCount,
            computedAt: nowIso,
          };
        }
        result.scannedChannels += 1;
      } catch (err) {
        if (isAppError(err) && err.code === 'YOUTUBE_API_QUOTA_EXCEEDED') {
          result.stoppedForQuota = true;
          break;
        }
        result.failedChannels.push({
          sourceId: source.id,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    pruneOldVideos(store, Date.now());
    store.lastScanAt = new Date().toISOString();
    result.quotaUsedToday = store.quota.used;
    radarRepository.write(store);
    return result;
  }

  list(options: RadarListOptions = {}) {
    const { maxAgeHours = 168, minViews = 1000, minDurationSeconds = 61, minRatio = 3, limit = 50 } = options;
    const store = radarRepository.read();
    const now = Date.now();
    const sourceNames = new Map(sourceChannelsRepository.findAll().map(s => [s.id, s.name]));

    const items: RadarItem[] = [];
    for (const video of Object.values(store.videos)) {
      const baseline = store.baselines[video.sourceId];
      if (!baseline) continue;

      const ageHours = (now - Date.parse(video.publishedAt)) / HOUR_MS;
      if (ageHours < MIN_FEED_AGE_HOURS || ageHours > maxAgeHours) continue;
      if (video.durationSeconds < minDurationSeconds) continue;

      const latest = video.snapshots[video.snapshots.length - 1];
      if (!latest || latest.views < minViews) continue;

      const expectedViews = expectedViewsAtAge(baseline.baselineViews, ageHours / 24);
      if (expectedViews <= 0) continue;

      const ratio = latest.views / expectedViews;
      const tier = classifyTier(ratio);
      if (!tier || ratio < minRatio) continue;

      items.push({
        videoId: video.id,
        title: video.title,
        url: video.url,
        sourceId: video.sourceId,
        sourceName: sourceNames.get(video.sourceId) ?? video.sourceId,
        publishedAt: video.publishedAt,
        ageHours,
        durationSeconds: video.durationSeconds,
        viewCount: latest.views,
        viewsPerHour: latest.views / ageHours,
        expectedViews,
        ratio,
        tier,
      });
    }

    items.sort((a, b) => b.ratio - a.ratio);
    return {
      items: items.slice(0, limit),
      lastScanAt: store.lastScanAt,
      quotaUsedToday: store.quota.used,
      quotaCap: env.youtubeApiDailyQuotaCap,
    };
  }

  status() {
    const store = radarRepository.read();
    return {
      apiKeyConfigured: isYoutubeDataApiConfigured(),
      trackedChannels: scannableSources().length,
      channelsWithBaseline: Object.keys(store.baselines).length,
      trackedVideos: Object.keys(store.videos).length,
      lastScanAt: store.lastScanAt,
      quotaUsedToday: store.quota.used,
      quotaCap: env.youtubeApiDailyQuotaCap,
      scanning: this.scanning,
      scanIntervalHours: env.radarScanIntervalHours,
    };
  }
}

export const radarService = new RadarService();
