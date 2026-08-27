import type { SourceChannel } from '../types/sourceChannel';
import type { ReupAudioVideoType, YoutubeChannel } from '../types/youtubeChannel';
import { fetchVisualStyles } from '../api/visualStyles';
import { LOCAL_STOCK_LABEL, LOCAL_STOCK_SENTINEL } from './backgroundFootage';

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

  if (channel.sourceChannelNames?.length) {
    return channel.sourceChannelNames;
  }

  if (channel.sourceNames?.length) {
    return channel.sourceNames;
  }

  return labels;
}

export function getChannelBackgroundFootageLabels(
  channel: YoutubeChannel,
  sources: SourceChannel[],
): string[] {
  const ids = channel.backgroundFootageSources ?? [];
  if (ids.includes(LOCAL_STOCK_SENTINEL)) {
    return [LOCAL_STOCK_LABEL];
  }

  const lookup = buildSourceLookup(sources);
  const labels = resolveLabelsFromIds(ids, lookup);

  if (labels.length > 0) {
    return labels;
  }

  return channel.backgroundFootageNames ?? [];
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
  _language?: string,
  options?: { signal?: AbortSignal },
): Promise<ReupAudioVideoStyleOption[]> {
  if (!videoType) {
    return [];
  }

  const { items } = await fetchVisualStyles(options);
  return items.map((item) => ({ value: item.id, label: `${item.name} (${item.niche})` }));
}

export function getReupAudioVideoStylePlaceholder(
  videoType: ReupAudioVideoType | '',
  loading: boolean,
  optionCount: number,
): string {
  if (loading) {
    return 'Đang tải kiểu hình ảnh...';
  }
  if (!videoType) {
    return 'Hãy chọn loại video trước';
  }
  if (optionCount === 0) {
    return 'Không có kiểu hình ảnh nào';
  }
  return 'Chọn kiểu video';
}
