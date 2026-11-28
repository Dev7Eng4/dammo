import { brainsRepository } from '../brains/brains.repository.js';
import { TREND_BRAIN_ID } from '../brains/brains.registry.js';
import type { Neuron } from '../brains/brains.types.js';
import { clusterName, isTopicOnlySource, OFF_NICHE, PSY_CLUSTERS, sourceTypeName } from '../brains/psy-clusters.js';
import { compareVerdicts, evaluateRemakeGates, type RemakeVerdict } from './remake-gates.js';

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
  /** narrated / manga / real-host / real-vlog / persona (see SOURCE_TYPES). */
  sourceType?: string;
  sourceTypeName?: string;
  /** Our channels may only borrow this video's topic (real-life vlog, speaks as a real famous person). */
  topicOnly: boolean;
  /** Why it is hot / why this cluster. */
  reason: string;
  source: 'brain' | 'skill' | 'unknown';
  hits: number;
  firstSeenAt: string;
  lastSeenAt: string;
  /** Remake gates: nên làm / có thể làm / không nên làm. */
  verdict: RemakeVerdict;
  verdictReasons: string[];
}

export interface TrendRadarOptions {
  /** Only videos seen by a run within this many days. Default 7. */
  days?: number;
  /** K1–K11, "off", or "none" (not tagged yet). */
  cluster?: string;
  verdict?: RemakeVerdict;
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
  const ageHours = publishedAt ? Math.max(0, (now - Date.parse(publishedAt)) / HOUR_MS) : undefined;
  const measuredAgeHours = publishedAt
    ? Math.max(0, (Date.parse(neuron.lastSeenAt) - Date.parse(publishedAt)) / HOUR_MS)
    : undefined;
  const gate = evaluateRemakeGates({
    minutes: num(meta.minutes),
    ageHours,
    measuredAgeHours,
    views: num(meta.views),
    ratio: num(meta.channelRatio),
    heat: neuron.heat,
    cluster,
    clusterUnsure: meta.clusterUnsure === 1,
    topicOnly: isTopicOnlySource(str(meta.sourceType)),
  });
  return {
    videoId: neuron.key.replace(/^video:/, ''),
    title: neuron.label,
    url: neuron.url ?? `https://www.youtube.com/watch?v=${neuron.key.replace(/^video:/, '')}`,
    channel: str(meta.channel) ?? '',
    channelId: str(meta.channelId) ?? '',
    publishedAt,
    ageHours,
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
    sourceType: str(meta.sourceType),
    sourceTypeName: str(meta.sourceType) ? sourceTypeName(str(meta.sourceType)!) : undefined,
    topicOnly: isTopicOnlySource(str(meta.sourceType)),
    reason: neuron.detail,
    source: source === 'brain' || source === 'skill' ? source : 'unknown',
    hits: neuron.hits,
    firstSeenAt: neuron.firstSeenAt,
    lastSeenAt: neuron.lastSeenAt,
    verdict: gate.verdict,
    verdictReasons: gate.reasons,
  };
}

/** Hot videos the trend hunter (brain or skill) stored, newest finding first, with per-cluster counts. */
export function listTrendRadar(options: TrendRadarOptions = {}) {
  const { days = 7, cluster, verdict, limit = 200 } = options;
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

  const inCluster = all.filter(item => !cluster || (cluster === 'none' ? !item.cluster : item.cluster === cluster));
  const verdicts = { do: 0, maybe: 0, skip: 0 } satisfies Record<RemakeVerdict, number>;
  for (const item of inCluster) verdicts[item.verdict] += 1;

  const items = inCluster
    .filter(item => !verdict || item.verdict === verdict)
    .sort(
      (a, b) =>
        compareVerdicts(a.verdict, b.verdict) ||
        b.lastSeenAt.slice(0, 10).localeCompare(a.lastSeenAt.slice(0, 10)) ||
        b.heat - a.heat ||
        b.viewsPerHour - a.viewsPerHour,
    )
    .slice(0, limit);

  const brain = store.brains[TREND_BRAIN_ID];
  return { items, clusters, verdicts, total: all.length, lastRunAt: brain?.lastRunAt };
}

/** Remake gate verdict of one trend-brain video neuron (same rules as the Radar). */
export function trendNeuronGate(neuron: Neuron, now = Date.now()): { verdict: RemakeVerdict; reasons: string[] } {
  const item = toItem(neuron, now);
  return { verdict: item.verdict, reasons: item.verdictReasons };
}

/** The source type the trend hunter gave a video, if it saved one (used to warn and steer remakes). */
export function trendVideoSourceType(videoId: string): string | undefined {
  const neuron = brainsRepository
    .read()
    .neurons.find(n => n.brainId === TREND_BRAIN_ID && n.kind === 'video' && n.key === `video:${videoId}`);
  return str(neuron?.meta?.sourceType);
}
