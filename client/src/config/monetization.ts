export type TrackId =
  | 'freelanceServices'
  | 'youtubeCore'
  | 'tiktokAffiliate'
  | 'affiliateBio'
  | 'fbReels'
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
  { id: 'freelanceServices', tier: 'now', scores: { earn: 3, aiFit: 4, speed: 5, safety: 5 } },
  { id: 'youtubeCore', tier: 'now', scores: { earn: 4, aiFit: 5, speed: 2, safety: 4 } },
  { id: 'tiktokAffiliate', tier: 'now', scores: { earn: 4, aiFit: 5, speed: 4, safety: 3 } },
  { id: 'affiliateBio', tier: 'now', scores: { earn: 2, aiFit: 4, speed: 3, safety: 5 } },
  { id: 'fbReels', tier: 'next', scores: { earn: 2, aiFit: 4, speed: 2, safety: 3 } },
  { id: 'dropshipOrganic', tier: 'later', scores: { earn: 4, aiFit: 3, speed: 2, safety: 2 } },
  { id: 'tiktokBeta', tier: 'later', scores: { earn: 4, aiFit: 3, speed: 1, safety: 1 } },
];

export const PHASE_IDS = ['p1', 'p2', 'p3', 'p4'] as const;
export const STEP_KEYS = ['step1', 'step2', 'step3', 'step4'] as const;
export const RULE_KEYS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'] as const;

export function trackTotal(track: MonetizationTrack): number {
  return SCORE_KEYS.reduce((sum, key) => sum + track.scores[key], 0);
}

export function rankedTracks(): MonetizationTrack[] {
  return [...monetizationTracks].sort((a, b) => trackTotal(b) - trackTotal(a));
}

/* ------------------------------------------------------------------ */
/* Markets: country / language analysis                               */
/* ------------------------------------------------------------------ */

export type MarketId = 'en' | 'de' | 'jp' | 'kr' | 'tw' | 'es' | 'br' | 'vn';

export type MarketTier = 'core' | 'expand' | 'test' | 'cash' | 'skip';

/** Availability of a platform's payout for a creator living in Vietnam. */
export type Access = 'ok' | 'limited' | 'no';

export type PlatformKey = 'ytLong' | 'ytShorts' | 'facebook' | 'tiktokRewards' | 'tiktokShop' | 'affiliate' | 'local';

/** USD per 1,000 views the creator receives, [low, high]. `null` = no payout path. */
export type RpmRange = [number, number] | null;

export interface Market {
  id: MarketId;
  tier: MarketTier;
  rpm: { ytLong: RpmRange; ytShorts: RpmRange; facebook: RpmRange };
  /** Share of ad revenue kept after US withholding on US viewers (no US tax treaty for VN residents). */
  keepRate: number;
  /** Monthly cost of a usable voice engine for this language, USD [low, high]. */
  voiceCost: [number, number];
  /** 1-5, higher is better. competition: 5 = least crowded. */
  scores: { rpm: number; access: number; competition: number; pipelineFit: number; size: number };
  platforms: Record<PlatformKey, Access>;
}

export const MARKET_SCORE_KEYS = ['rpm', 'access', 'competition', 'pipelineFit', 'size'] as const;
export const PLATFORM_KEYS: PlatformKey[] = [
  'ytLong',
  'ytShorts',
  'facebook',
  'tiktokRewards',
  'tiktokShop',
  'affiliate',
  'local',
];
export const MARKET_TEXT_KEYS = ['invest', 'limits', 'firstSteps'] as const;

export const markets: Market[] = [
  {
    id: 'jp',
    tier: 'core',
    rpm: { ytLong: [2.5, 6], ytShorts: [0.03, 0.12], facebook: [0.4, 1.5] },
    keepRate: 0.97,
    voiceCost: [0, 0],
    scores: { rpm: 3, access: 4, competition: 3, pipelineFit: 5, size: 3 },
    platforms: {
      ytLong: 'ok',
      ytShorts: 'ok',
      facebook: 'limited',
      tiktokRewards: 'no',
      tiktokShop: 'no',
      affiliate: 'limited',
      local: 'no',
    },
  },
  {
    id: 'en',
    tier: 'expand',
    rpm: { ytLong: [5, 12], ytShorts: [0.05, 0.25], facebook: [1, 4] },
    keepRate: 0.75,
    voiceCost: [5, 22],
    scores: { rpm: 5, access: 4, competition: 1, pipelineFit: 4, size: 5 },
    platforms: {
      ytLong: 'ok',
      ytShorts: 'ok',
      facebook: 'limited',
      tiktokRewards: 'no',
      tiktokShop: 'no',
      affiliate: 'ok',
      local: 'ok',
    },
  },
  {
    id: 'de',
    tier: 'expand',
    rpm: { ytLong: [4, 9], ytShorts: [0.04, 0.2], facebook: [0.8, 3] },
    keepRate: 0.97,
    voiceCost: [5, 22],
    scores: { rpm: 5, access: 4, competition: 4, pipelineFit: 3, size: 3 },
    platforms: {
      ytLong: 'ok',
      ytShorts: 'ok',
      facebook: 'limited',
      tiktokRewards: 'no',
      tiktokShop: 'no',
      affiliate: 'ok',
      local: 'limited',
    },
  },
  {
    id: 'kr',
    tier: 'test',
    rpm: { ytLong: [2, 5], ytShorts: [0.03, 0.12], facebook: [0.3, 1.2] },
    keepRate: 0.97,
    voiceCost: [5, 22],
    scores: { rpm: 3, access: 3, competition: 3, pipelineFit: 3, size: 2 },
    platforms: {
      ytLong: 'ok',
      ytShorts: 'ok',
      facebook: 'limited',
      tiktokRewards: 'no',
      tiktokShop: 'no',
      affiliate: 'limited',
      local: 'no',
    },
  },
  {
    id: 'tw',
    tier: 'test',
    rpm: { ytLong: [1.5, 4], ytShorts: [0.02, 0.1], facebook: [0.5, 2] },
    keepRate: 0.97,
    voiceCost: [5, 22],
    scores: { rpm: 2, access: 4, competition: 4, pipelineFit: 3, size: 2 },
    platforms: {
      ytLong: 'ok',
      ytShorts: 'ok',
      facebook: 'limited',
      tiktokRewards: 'no',
      tiktokShop: 'no',
      affiliate: 'limited',
      local: 'limited',
    },
  },
  {
    id: 'es',
    tier: 'test',
    rpm: { ytLong: [1, 4], ytShorts: [0.02, 0.08], facebook: [0.3, 1.5] },
    keepRate: 0.88,
    voiceCost: [5, 22],
    scores: { rpm: 2, access: 4, competition: 3, pipelineFit: 4, size: 5 },
    platforms: {
      ytLong: 'ok',
      ytShorts: 'ok',
      facebook: 'limited',
      tiktokRewards: 'no',
      tiktokShop: 'no',
      affiliate: 'ok',
      local: 'limited',
    },
  },
  {
    id: 'br',
    tier: 'skip',
    rpm: { ytLong: [0.8, 2.5], ytShorts: [0.01, 0.05], facebook: [0.2, 1] },
    keepRate: 0.97,
    voiceCost: [5, 22],
    scores: { rpm: 1, access: 4, competition: 3, pipelineFit: 4, size: 4 },
    platforms: {
      ytLong: 'ok',
      ytShorts: 'ok',
      facebook: 'limited',
      tiktokRewards: 'no',
      tiktokShop: 'no',
      affiliate: 'limited',
      local: 'limited',
    },
  },
  {
    id: 'vn',
    tier: 'cash',
    rpm: { ytLong: [0.3, 1.2], ytShorts: [0.01, 0.04], facebook: [0.1, 0.6] },
    keepRate: 1,
    voiceCost: [0, 10],
    scores: { rpm: 1, access: 5, competition: 2, pipelineFit: 4, size: 3 },
    platforms: {
      ytLong: 'ok',
      ytShorts: 'ok',
      facebook: 'ok',
      tiktokRewards: 'no',
      tiktokShop: 'ok',
      affiliate: 'ok',
      local: 'ok',
    },
  },
];

export function marketTotal(market: Market): number {
  return MARKET_SCORE_KEYS.reduce((sum, key) => sum + market.scores[key], 0);
}

const MARKET_TIER_ORDER: MarketTier[] = ['core', 'cash', 'expand', 'test', 'skip'];

/** Ordered by recommended priority first, then by total score. */
export function rankedMarkets(): Market[] {
  return [...markets].sort(
    (a, b) =>
      MARKET_TIER_ORDER.indexOf(a.tier) - MARKET_TIER_ORDER.indexOf(b.tier) || marketTotal(b) - marketTotal(a),
  );
}

/** Monthly income estimate in USD [low, high] after withholding, before voice cost. */
export function estimateIncome(
  market: Market,
  views: { long: number; shorts: number; facebook: number },
): [number, number] {
  const part = (range: RpmRange, count: number, i: 0 | 1) => (range ? (range[i] * count) / 1000 : 0);
  const at = (i: 0 | 1) =>
    (part(market.rpm.ytLong, views.long, i) +
      part(market.rpm.ytShorts, views.shorts, i) +
      part(market.rpm.facebook, views.facebook, i)) *
    market.keepRate;
  return [at(0), at(1)];
}
