import { brainsRepository } from '../brains/brains.repository.js';
import { TREND_BRAIN_ID } from '../brains/brains.registry.js';
import type { Neuron } from '../brains/brains.types.js';
import { clusterName, OFF_NICHE, PSY_CLUSTERS } from '../brains/psy-clusters.js';

const HOUR_MS = 3_600_000;

/** A hot video found by the jp-psy-trends brain or skill (numbers as they were when it was last seen). */
export interface TrendRadarItem {
  videoId: string;
  title: string;
  url: string;
  channel: string;
  channelId: string;
  /** Estimated from the relative "3 日前" at capture time. */
  publishedAt?: string;
  ageHours?: number;
  minutes: number;
  views: number;
  viewsPerHour: number;
  /** views/hour ÷ the channel's median views/hour, when the channel was checked. */
  channelRatio?: number;
  heat: number;
  cluster?: string;
  clusterName?: string;
  clusterUnsure: boolean;
  subCluster?: string;
  format?: string;
  /** Why it is hot / why this cluster. */
  reason: string;
  source: 'brain' | 'skill' | 'unknown';
  hits: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface TrendRadarOptions {
  /** Only videos seen by a run within this many days. Default 7. */
  days?: number;
  /** K1–K11, "off", or "none" (not tagged yet). */
  cluster?: string;
  limit?: number;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toItem(neuron: Neuron, now: number): TrendRadarItem {
  const meta = neuron.meta ?? {};
  const publishedAt = str(meta.publishedAt);
  const cluster = str(meta.cluster);
  const source = str(meta.source);
  return {
    videoId: neuron.key.replace(/^video:/, ''),
    title: neuron.label,
    url: neuron.url ?? `https://www.youtube.com/watch?v=${neuron.key.replace(/^video:/, '')}`,
    channel: str(meta.channel) ?? '',
    channelId: str(meta.channelId) ?? '',
    publishedAt,
    ageHours: publishedAt ? Math.max(0, (now - Date.parse(publishedAt)) / HOUR_MS) : undefined,
    minutes: num(meta.minutes) ?? 0,
    views: num(meta.views) ?? 0,
    viewsPerHour: num(meta.viewsPerHour) ?? 0,
    channelRatio: num(meta.channelRatio),
    heat: neuron.heat,
    cluster,
    clusterName: cluster && cluster !== OFF_NICHE ? clusterName(cluster) : undefined,
    clusterUnsure: meta.clusterUnsure === 1,
    subCluster: str(meta.subCluster),
    format: str(meta.format),
    reason: neuron.detail,
    source: source === 'brain' || source === 'skill' ? source : 'unknown',
    hits: neuron.hits,
    firstSeenAt: neuron.firstSeenAt,
    lastSeenAt: neuron.lastSeenAt,
  };
}

/** Hot videos the trend hunter (brain or skill) stored, newest finding first, with per-cluster counts. */
export function listTrendRadar(options: TrendRadarOptions = {}) {
  const { days = 7, cluster, limit = 200 } = options;
  const now = Date.now();
  const since = now - days * 24 * HOUR_MS;
  const store = brainsRepository.read();
  const all = store.neurons
    .filter(n => n.brainId === TREND_BRAIN_ID && n.kind === 'video' && Date.parse(n.lastSeenAt) >= since)
    .map(n => toItem(n, now));

  const clusters = [...PSY_CLUSTERS.map(c => c.id as string), OFF_NICHE, 'none'].map(id => {
    const items = all.filter(item => (id === 'none' ? !item.cluster : item.cluster === id));
    return {
      id,
      name: id === OFF_NICHE ? 'Ngoài ngách' : id === 'none' ? 'Chưa gán cụm' : clusterName(id),
      count: items.length,
      topViewsPerHour: Math.max(0, ...items.map(item => item.viewsPerHour)),
    };
  });

  const items = all
    .filter(item => !cluster || (cluster === 'none' ? !item.cluster : item.cluster === cluster))
    .sort((a, b) => b.lastSeenAt.slice(0, 10).localeCompare(a.lastSeenAt.slice(0, 10)) || b.heat - a.heat || b.viewsPerHour - a.viewsPerHour)
    .slice(0, limit);

  const brain = store.brains[TREND_BRAIN_ID];
  return { items, clusters, total: all.length, lastRunAt: brain?.lastRunAt };
}
