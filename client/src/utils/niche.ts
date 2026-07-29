import type { Niche } from '../types/niche';
import type { SourceChannel } from '../types/sourceChannel';

export function resolveNicheLabel(nicheKey: string, niches: Niche[]): string {
  return niches.find((item) => item.key === nicheKey)?.label ?? nicheKey;
}

export function formatSourceChannelOptionLabel(
  source: SourceChannel,
  niches: Niche[],
): string {
  const nicheLabel = resolveNicheLabel(source.niche, niches);
  const usageCount = source.youtubeChannelUsageCount ?? 0;
  const handle = source.url.trim() || source.fullUrl.trim();
  return `${source.name} - ${handle} (${nicheLabel} - ${usageCount})`;
}
