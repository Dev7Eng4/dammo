import type { SourceChannel } from '../types/sourceChannel';
import type { YoutubeChannel } from '../types/youtubeChannel';

function buildSourceLookup(sources: SourceChannel[]): Map<string, SourceChannel> {
  const lookup = new Map<string, SourceChannel>();

  for (const source of sources) {
    lookup.set(source.id, source);
  }

  return lookup;
}

export function getChannelSourceLabels(
  channel: YoutubeChannel,
  sources: SourceChannel[],
): string[] {
  if (channel.sourceNames?.length) {
    return channel.sourceNames;
  }

  const labels: string[] = [];
  const lookup = buildSourceLookup(sources);

  for (const sourceId of channel.sourceChannels ?? []) {
    const matched = lookup.get(sourceId);
    if (matched && !labels.includes(matched.name)) {
      labels.push(matched.name);
    }
  }

  for (const sourceId of [
    ...(channel.backgroundFootageSources ?? []),
    channel.reupVideoSourceId,
    channel.reupAudioSourceId,
  ]) {
    if (!sourceId) continue;
    const source = lookup.get(sourceId);
    if (source && !labels.includes(source.name)) {
      labels.push(source.name);
    }
  }

  return labels;
}

export function formatChannelSources(channel: YoutubeChannel, sources: SourceChannel[]): string {
  const labels = getChannelSourceLabels(channel, sources);
  return labels.length > 0 ? labels.join(', ') : '—';
}
