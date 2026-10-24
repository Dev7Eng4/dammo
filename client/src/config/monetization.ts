export type TrackId =
  | 'tiktokAffiliate'
  | 'affiliateBio'
  | 'fbReels'
  | 'youtubeCore'
  | 'tiktokBeta'
  | 'dropshipOrganic';

export type TrackTier = 'now' | 'next' | 'later';

export interface MonetizationTrack {
  id: TrackId;
  tier: TrackTier;
  /** All scores are 1-5, higher is better (safety: 5 = lowest platform risk). */
  scores: { earn: number; aiFit: number; speed: number; safety: number };
}

export const SCORE_KEYS = ['earn', 'aiFit', 'speed', 'safety'] as const;

export const monetizationTracks: MonetizationTrack[] = [
  { id: 'tiktokAffiliate', tier: 'now', scores: { earn: 5, aiFit: 5, speed: 4, safety: 4 } },
  { id: 'affiliateBio', tier: 'now', scores: { earn: 3, aiFit: 4, speed: 3, safety: 4 } },
  { id: 'fbReels', tier: 'next', scores: { earn: 3, aiFit: 4, speed: 3, safety: 3 } },
  { id: 'youtubeCore', tier: 'now', scores: { earn: 3, aiFit: 5, speed: 1, safety: 4 } },
  { id: 'tiktokBeta', tier: 'next', scores: { earn: 4, aiFit: 3, speed: 2, safety: 3 } },
  { id: 'dropshipOrganic', tier: 'later', scores: { earn: 4, aiFit: 3, speed: 2, safety: 2 } },
];

export const PHASE_IDS = ['p1', 'p2', 'p3'] as const;
export const STEP_KEYS = ['step1', 'step2', 'step3', 'step4'] as const;

export function trackTotal(track: MonetizationTrack): number {
  return SCORE_KEYS.reduce((sum, key) => sum + track.scores[key], 0);
}

export function rankedTracks(): MonetizationTrack[] {
  return [...monetizationTracks].sort((a, b) => trackTotal(b) - trackTotal(a));
}
