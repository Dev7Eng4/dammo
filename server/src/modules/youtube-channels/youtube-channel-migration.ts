import { resolveSourceChannelsFromMapping } from './youtube-channel-sources.js';
import type { YoutubeChannel } from './youtube-channels.types.js';

type LegacyYoutubeChannel = YoutubeChannel & {
  sourceMapping?: string;
  backgroundFootageSourceId?: string;
  /** @deprecated removed from persisted channel shape */
  recentActivity?: unknown;
};

export function normalizeYoutubeChannel(raw: LegacyYoutubeChannel): YoutubeChannel {
  let sourceChannels = Array.isArray(raw.sourceChannels)
    ? [...new Set(raw.sourceChannels.map(id => String(id).trim()).filter(Boolean))]
    : [];

  if (sourceChannels.length === 0 && typeof raw.sourceMapping === 'string' && raw.sourceMapping.trim()) {
    sourceChannels = resolveSourceChannelsFromMapping(raw.sourceMapping).map(source => source.id);
    if (sourceChannels.length === 0) {
      console.warn(
        `[youtube-channels] Could not migrate sourceMapping for channel ${raw.id}: ${raw.sourceMapping}`,
      );
    }
  }

  let backgroundFootageSources = Array.isArray(raw.backgroundFootageSources)
    ? [...new Set(raw.backgroundFootageSources.map(id => String(id).trim()).filter(Boolean))]
    : [];

  if (backgroundFootageSources.length === 0 && raw.backgroundFootageSourceId?.trim()) {
    backgroundFootageSources = [raw.backgroundFootageSourceId.trim()];
  }

  const { sourceMapping: _sm, backgroundFootageSourceId: _bf, recentActivity: _ra, ...rest } = raw;

  return {
    ...rest,
    sourceChannels,
    ...(backgroundFootageSources.length > 0 ? { backgroundFootageSources } : {}),
  };
}

export function channelNeedsMigration(raw: LegacyYoutubeChannel): boolean {
  const hasLegacySourceMapping = typeof raw.sourceMapping === 'string' && raw.sourceMapping.trim().length > 0;
  const hasLegacyBackground = Boolean(raw.backgroundFootageSourceId?.trim());
  const missingSourceChannels = !Array.isArray(raw.sourceChannels);
  const missingBackgroundSources = !Array.isArray(raw.backgroundFootageSources);
  return hasLegacySourceMapping || hasLegacyBackground || missingSourceChannels || missingBackgroundSources;
}
