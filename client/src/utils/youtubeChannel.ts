import type { SourceChannel } from '../types/sourceChannel';
import type { ReupAudioVideoType, YoutubeChannel, YoutubeChannelLanguage } from '../types/youtubeChannel';
import { fetchPrompts } from '../api/prompts';
import { fetchVisualStyles } from '../api/visualStyles';

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

  const hasBackgroundFootage = (channel.backgroundFootageSources ?? []).length > 0;
  if (!hasBackgroundFootage && channel.sourceNames?.length) {
    return channel.sourceNames;
  }

  return labels;
}

export function getChannelBackgroundFootageLabels(
  channel: YoutubeChannel,
  sources: SourceChannel[],
): string[] {
  const lookup = buildSourceLookup(sources);
  return resolveLabelsFromIds(channel.backgroundFootageSources ?? [], lookup);
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
  language: YoutubeChannelLanguage | '',
  options?: { signal?: AbortSignal },
): Promise<ReupAudioVideoStyleOption[]> {
  if (!videoType) {
    return [];
  }

  if (videoType === 'ai') {
    if (!language) {
      return [];
    }
    const { items } = await fetchPrompts('image', language, '', 1, 200, options);
    return items.map((prompt) => ({ value: prompt.id, label: prompt.name }));
  }

  const { items } = await fetchVisualStyles(options);
  return items.map((item) => ({ value: item.id, label: item.name }));
}

export function getReupAudioVideoStylePlaceholder(
  videoType: ReupAudioVideoType | '',
  loading: boolean,
  optionCount: number,
): string {
  if (loading) {
    return 'Loading styles...';
  }
  if (!videoType) {
    return 'Select video type first';
  }
  if (videoType === 'ai' && optionCount === 0) {
    return 'No image prompts for this language';
  }
  if (optionCount === 0) {
    return 'No visual styles available';
  }
  return 'Select video style';
}
