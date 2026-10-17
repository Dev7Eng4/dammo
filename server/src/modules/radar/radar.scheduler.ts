import { env } from '../../config/env.js';
import { isYoutubeDataApiConfigured } from '../../infrastructure/youtube/youtube-data-api.js';
import { radarRepository } from './radar.repository.js';
import { radarService } from './radar.service.js';

const HOUR_MS = 3_600_000;
/** Never fire sooner than this after boot, so a restart loop (tsx watch) cannot burn quota. */
const MIN_DELAY_MS = 60_000;

let timer: ReturnType<typeof setTimeout> | null = null;
let stopped = true;

/** Milliseconds until the next scan is due, based on the last completed scan. */
export function computeNextDelayMs(lastScanAt: string | undefined, intervalMs: number, now = Date.now()): number {
  const last = lastScanAt ? Date.parse(lastScanAt) : Number.NaN;
  if (!Number.isFinite(last)) return MIN_DELAY_MS;
  return Math.max(MIN_DELAY_MS, last + intervalMs - now);
}

function schedule(intervalMs: number): void {
  if (stopped) return;
  const delay = computeNextDelayMs(radarRepository.read().lastScanAt, intervalMs);
  timer = setTimeout(() => void tick(intervalMs), delay);
  timer.unref();
}

async function tick(intervalMs: number): Promise<void> {
  if (stopped) return;
  try {
    if (!radarService.isScanning()) {
      const result = await radarService.scan();
      console.log(
        `[radar] scheduled scan: ${result.scannedChannels} scanned, ${result.failedChannels.length} failed, ` +
          `${result.quotaUsedToday}/${result.quotaCap} quota used${result.stoppedForQuota ? ' (stopped at quota cap)' : ''}`,
      );
    }
  } catch (err) {
    console.error('[radar] scheduled scan failed', err instanceof Error ? err.message : err);
  } finally {
    schedule(intervalMs);
  }
}

export function startRadarScheduler(): void {
  const hours = env.radarScanIntervalHours;
  if (!(hours > 0)) {
    console.log('[radar] scheduler disabled (RADAR_SCAN_INTERVAL_HOURS=0)');
    return;
  }
  if (!isYoutubeDataApiConfigured()) {
    console.log('[radar] scheduler not started: YOUTUBE_API_KEY is not set');
    return;
  }
  if (!stopped) return;

  stopped = false;
  schedule(hours * HOUR_MS);
  console.log(`[radar] scheduler started: scanning every ${hours}h`);
}

export function stopRadarScheduler(): void {
  stopped = true;
  if (timer) clearTimeout(timer);
  timer = null;
}
