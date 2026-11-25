import i18n from '../i18n';
import type { SourceChannel } from '../types/sourceChannel';
import type { ReupAudioVideoType, YoutubeChannel } from '../types/youtubeChannel';
import { fetchVisualStyles } from '../api/visualStyles';
import { LOCAL_STOCK_SENTINEL } from './backgroundFootage';

function buildSourceLookup(sources: SourceChannel[]): Map<string, SourceChannel> {
  const lookup = new Map<string, SourceChannel>();

  for (const source of sources) {
    lookup.set(source.id, source);
  }

  return lookup;
}

function resolveLabelsFromIds(
  sourceIds: Array<string | undefined>,
  lookup: Map<string, SourceChannel>,
): string[] {
  const labels: string[] = [];

  for (const sourceId of sourceIds) {
    if (!sourceId) continue;
    const source = lookup.get(sourceId);
    if (source && !labels.includes(source.name)) {
      labels.push(source.name);
    }
  }

  return labels;
}

/** Built-in sources the server names in Vietnamese; real channel names pass through. */
const BUILT_IN_SOURCE_KEYS: Record<string, string> = {
  'Bộ não săn xu hướng': 'youtube:form.sourceMode.trendBrain',
  'Máy tính Local': 'youtube:form.localStock',
};

export function localizeSourceNames(names: string[]): string[] {
  return names.map((name) => (BUILT_IN_SOURCE_KEYS[name] ? i18n.t(BUILT_IN_SOURCE_KEYS[name]) : name));
}

export function getChannelSourceLabels(
  channel: YoutubeChannel,
  sources: SourceChannel[],
): string[] {
  const lookup = buildSourceLookup(sources);
  const labels = resolveLabelsFromIds(
    [...(channel.sourceChannels ?? []), channel.reupVideoSourceId, channel.reupAudioSourceId],
    lookup,
  );

  if (labels.length > 0) {
    return labels;
  }

  if (channel.sourceChannelNames?.length) {
    return localizeSourceNames(channel.sourceChannelNames);
  }

  if (channel.sourceNames?.length) {
    return localizeSourceNames(channel.sourceNames);
  }

  return labels;
}

export function getChannelBackgroundFootageLabels(
  channel: YoutubeChannel,
  sources: SourceChannel[],
): string[] {
  const ids = channel.backgroundFootageSources ?? [];
  if (ids.includes(LOCAL_STOCK_SENTINEL)) {
    return [i18n.t('youtube:form.localStock')];
  }

  const lookup = buildSourceLookup(sources);
  const labels = resolveLabelsFromIds(ids, lookup);

  if (labels.length > 0) {
    return labels;
  }

  return localizeSourceNames(channel.backgroundFootageNames ?? []);
}

function formatLabels(labels: string[]): string {
  return labels.length > 0 ? labels.join(', ') : '—';
}

export function formatChannelSources(channel: YoutubeChannel, sources: SourceChannel[]): string {
  return formatLabels(getChannelSourceLabels(channel, sources));
}

export function formatChannelBackgroundFootage(
  channel: YoutubeChannel,
  sources: SourceChannel[],
): string {
  return formatLabels(getChannelBackgroundFootageLabels(channel, sources));
}

export interface ReupAudioVideoStyleOption {
  value: string;
  label: string;
}

export async function loadReupAudioVideoStyleOptions(
  videoType: ReupAudioVideoType | '',
  language?: string,
  options?: { signal?: AbortSignal },
): Promise<ReupAudioVideoStyleOption[]> {
  if (!videoType) {
    return [];
  }

  const { items } = await fetchVisualStyles(options);
  return items
    .filter((item) => !language || item.language === 'all' || item.language === language)
    .map((item) => ({ value: item.id, label: `${item.name} (${item.niche})` }));
}

export function getReupAudioVideoStylePlaceholder(
  videoType: ReupAudioVideoType | '',
  loading: boolean,
  optionCount: number,
): string {
  if (loading) {
    return i18n.t('form.videoStyleLoading', { ns: 'youtube' });
  }
  if (!videoType) {
    return i18n.t('form.videoStyleNeedType', { ns: 'youtube' });
  }
  if (optionCount === 0) {
    return i18n.t('form.videoStyleEmpty', { ns: 'youtube' });
  }
  return i18n.t('form.videoStylePlaceholder', { ns: 'youtube' });
}
