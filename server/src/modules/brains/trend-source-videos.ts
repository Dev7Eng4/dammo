import { compareVerdicts, type RemakeVerdict } from '../radar/remake-gates.js';
import { trendNeuronGate } from '../radar/radar-trends.js';
import { videoPrepareRepository } from '../youtube-channels/video-prepare.repository.js';
import { youtubeChannelsRepository } from '../youtube-channels/youtube-channels.repository.js';
import { brainsRepository } from './brains.repository.js';
import { TREND_BRAIN_ID } from './brains.registry.js';
import { PSY_CLUSTERS } from './psy-clusters.js';

/**
 * Videos the trend brain (jp-psy-trends) found, as a source list for channels whose `sourceMode` is
 * `trend_brain` — they remake whatever is hot right now instead of one fixed source channel.
 */

/** Virtual source id for trend-brain videos (no real source channel / pre-downloaded folder). */
export const TREND_BRAIN_SOURCE_ID = 'trend-brain';

export { TREND_BRAIN_SOURCE_NAME } from '../youtube-channels/youtube-channel-sources.js';

export interface TrendSourceVideo {
  id: string;
  title: string;
  url: string;
  viewCount?: number;
  duration?: number;
  sourceId: string;
  /** 0-100 from the brain: how hot the video is right now. */
  heat: number;
  viewsPerHour?: number;
  cluster?: string;
  channelName?: string;
  /** Remake gates (see radar/remake-gates.ts). */
  verdict: RemakeVerdict;
}

export const TREND_CLUSTER_IDS: readonly string[] = PSY_CLUSTERS.map(cluster => cluster.id);

function videoIdOf(key: string, url: string | undefined): string | null {
  const fromKey = /^video:([\w-]{11})$/.exec(key)?.[1];
  if (fromKey) return fromKey;
  const fromUrl = url ? /[?&]v=([\w-]{11})/.exec(url)?.[1] : undefined;
  return fromUrl ?? null;
}

function asNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * "Nên làm" before "có thể làm", then hottest first (heat, then views/hour). `clusters` limits to
 * videos whose MAIN cluster is one of those (the sub cluster is ignored, same as the Radar cluster
 * filter); empty = every cluster, off-niche videos excluded. Videos that fail a remake gate
 * ("không nên làm": wrong length, too few real views…) are left out unless `includeSkipped`
 * (used when the user picked the videos by hand).
 */
export function listTrendSourceVideos(
  options: { clusters?: string[]; includeSkipped?: boolean } = {},
): TrendSourceVideo[] {
  const clusters = new Set((options.clusters ?? []).filter(id => TREND_CLUSTER_IDS.includes(id)));
  const seen = new Set<string>();
  const videos: TrendSourceVideo[] = [];
  const now = Date.now();

  for (const neuron of brainsRepository.read().neurons) {
    if (neuron.brainId !== TREND_BRAIN_ID || neuron.kind !== 'video') continue;
    const id = videoIdOf(neuron.key, neuron.url);
    if (!id || seen.has(id)) continue;

    const cluster = typeof neuron.meta?.cluster === 'string' ? neuron.meta.cluster : undefined;
    if (!cluster || !TREND_CLUSTER_IDS.includes(cluster)) continue;
    if (clusters.size > 0 && !clusters.has(cluster)) continue;

    const { verdict } = trendNeuronGate(neuron, now);
    if (verdict === 'skip' && !options.includeSkipped) continue;

    seen.add(id);
    const minutes = asNumber(neuron.meta?.minutes);
    videos.push({
      id,
      title: neuron.labelJa?.trim() || neuron.label,
      url: neuron.url ?? `https://www.youtube.com/watch?v=${id}`,
      viewCount: asNumber(neuron.meta?.views),
      ...(minutes !== undefined ? { duration: Math.round(minutes * 60) } : {}),
      sourceId: TREND_BRAIN_SOURCE_ID,
      heat: neuron.heat,
      viewsPerHour: asNumber(neuron.meta?.viewsPerHour),
      cluster,
      channelName: typeof neuron.meta?.channel === 'string' ? neuron.meta.channel : undefined,
      verdict,
    });
  }

  return videos.sort(
    (a, b) => compareVerdicts(a.verdict, b.verdict) || b.heat - a.heat || (b.viewsPerHour ?? 0) - (a.viewsPerHour ?? 0),
  );
}

/**
 * Trend videos already taken by another trend-mode channel, so two channels never remake the same
 * hot video.
 */
export function trendVideoIdsClaimedByOthers(channelId: string): Set<string> {
  const claimed = new Set<string>();
  for (const channel of youtubeChannelsRepository.findAll()) {
    if (channel.id === channelId || channel.sourceMode !== 'trend_brain') continue;
    for (const id of videoPrepareRepository.getPreparedVideoIds(channel.id)) claimed.add(id);
  }
  return claimed;
}
