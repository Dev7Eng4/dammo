import type { SourceChannel } from '../types/sourceChannel';
import type { YoutubeChannel } from '../types/youtubeChannel';
import { canonicalizeSourceUrl } from './canonicalizeSourceUrl';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function buildSourceLookup(sources: SourceChannel[]): Map<string, SourceChannel> {
  const lookup = new Map<string, SourceChannel>();

  for (const source of sources) {
    const keys = new Set<string>();
    keys.add(canonicalizeSourceUrl(source.fullUrl));
    keys.add(canonicalizeSourceUrl(source.url));
    keys.add(source.id);
    if (source.channelId) {
      keys.add(canonicalizeSourceUrl(`https://youtube.com/channel/${source.channelId}`));
    }

    for (const key of keys) {
      if (key) lookup.set(key, source);
    }
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

  const sourceMapping = channel.sourceMapping?.trim() ?? '';
  if (sourceMapping) {
    for (const part of sourceMapping.split(',')) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      const matched = UUID_RE.test(trimmed)
        ? lookup.get(trimmed)
        : lookup.get(canonicalizeSourceUrl(trimmed));
      if (matched && !labels.includes(matched.name)) {
        labels.push(matched.name);
      }
    }
  }

  for (const sourceId of [
    channel.backgroundFootageSourceId,
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
