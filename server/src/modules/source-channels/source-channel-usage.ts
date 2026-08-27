import { LOCAL_STOCK_SENTINEL } from '../video-production/shared/stock-background/stock-background.constants.js';
import { youtubeChannelsRepository } from '../youtube-channels/youtube-channels.repository.js';

export type SourceUsagePlatform = 'youtube' | 'tiktok' | 'facebook';

export interface ChannelUsingSource {
  id: string;
  name: string;
  platform: SourceUsagePlatform;
}

export interface SourceChannelUsage {
  inUse: boolean;
  channels: Record<SourceUsagePlatform, ChannelUsingSource[]>;
}

function isYoutubeChannelUsingSource(
  channel: {
    sourceChannels: string[];
    backgroundFootageSources?: string[];
    reupVideoSourceId?: string;
    reupAudioSourceId?: string;
  },
  sourceId: string,
): boolean {
  if (channel.backgroundFootageSources?.includes(sourceId)) return true;
  if (channel.reupVideoSourceId === sourceId) return true;
  if (channel.reupAudioSourceId === sourceId) return true;
  if (!channel.sourceChannels.length) return false;

  return channel.sourceChannels.includes(sourceId);
}

export function findYoutubeChannelsUsingSource(sourceId: string): ChannelUsingSource[] {
  return youtubeChannelsRepository
    .findAll()
    .filter((channel) => isYoutubeChannelUsingSource(channel, sourceId))
    .map((channel) => ({ id: channel.id, name: channel.name, platform: 'youtube' as const }));
}

/** Build sourceId -> unique YouTube channel count in a single pass. */
export function buildYoutubeChannelUsageCountMap(): Map<string, number> {
  const counts = new Map<string, number>();

  for (const channel of youtubeChannelsRepository.findAll()) {
    const sourceIds = new Set<string>();

    for (const sourceId of channel.sourceChannels) {
      if (sourceId) sourceIds.add(sourceId);
    }
    for (const sourceId of channel.backgroundFootageSources ?? []) {
      if (sourceId && sourceId !== LOCAL_STOCK_SENTINEL) sourceIds.add(sourceId);
    }
    if (channel.reupVideoSourceId) sourceIds.add(channel.reupVideoSourceId);
    if (channel.reupAudioSourceId) sourceIds.add(channel.reupAudioSourceId);

    for (const sourceId of sourceIds) {
      counts.set(sourceId, (counts.get(sourceId) ?? 0) + 1);
    }
  }

  return counts;
}

export function findTiktokChannelsUsingSource(_sourceId: string): ChannelUsingSource[] {
  return [];
}

export function findFacebookChannelsUsingSource(_sourceId: string): ChannelUsingSource[] {
  return [];
}

export function getSourceChannelUsage(sourceId: string): SourceChannelUsage {
  const youtube = findYoutubeChannelsUsingSource(sourceId);
  const tiktok = findTiktokChannelsUsingSource(sourceId);
  const facebook = findFacebookChannelsUsingSource(sourceId);
  const all = [...youtube, ...tiktok, ...facebook];

  return {
    inUse: all.length > 0,
    channels: { youtube, tiktok, facebook },
  };
}
