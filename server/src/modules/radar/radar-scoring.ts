import type { RadarTier } from './radar.types.js';

/**
 * Generic share of a video's eventual (28-day+) views reached by a given age in days.
 * This is an ASSUMPTION used until per-channel age curves can be learned from snapshots.
 */
const AGE_CURVE: ReadonlyArray<readonly [days: number, share: number]> = [
  [0, 0],
  [1, 0.25],
  [2, 0.38],
  [3, 0.47],
  [7, 0.65],
  [14, 0.8],
  [28, 0.92],
  [60, 1],
];

export const MATURE_AGE_DAYS = 28;
export const MIN_MATURE_VIDEOS = 5;

export const TIER_THRESHOLDS = { spike: 3, burst: 8, super: 20 } as const;

export function viewShareAtAge(ageDays: number): number {
  if (!(ageDays > 0)) return AGE_CURVE[0][1];
  for (let i = 1; i < AGE_CURVE.length; i++) {
    const [d1, s1] = AGE_CURVE[i];
    if (ageDays <= d1) {
      const [d0, s0] = AGE_CURVE[i - 1];
      return s0 + ((s1 - s0) * (ageDays - d0)) / (d1 - d0);
    }
  }
  return 1;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface AgedVideo {
  views: number;
  ageDays: number;
}

/**
 * Typical lifetime views of a channel: median of (views ÷ share-at-age) over videos old enough
 * that the curve is nearly flat. Returns null when there are too few mature videos to trust.
 */
export function computeChannelBaseline(videos: AgedVideo[]): { baselineViews: number; matureCount: number } | null {
  const mature = videos.filter(v => v.ageDays >= MATURE_AGE_DAYS && v.views > 0);
  if (mature.length < MIN_MATURE_VIDEOS) return null;
  const baselineViews = median(mature.map(v => v.views / viewShareAtAge(v.ageDays)));
  return baselineViews > 0 ? { baselineViews, matureCount: mature.length } : null;
}

export function expectedViewsAtAge(baselineViews: number, ageDays: number): number {
  return baselineViews * viewShareAtAge(ageDays);
}

export function classifyTier(ratio: number): RadarTier | null {
  if (ratio >= TIER_THRESHOLDS.super) return 'super';
  if (ratio >= TIER_THRESHOLDS.burst) return 'burst';
  if (ratio >= TIER_THRESHOLDS.spike) return 'spike';
  return null;
}
