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
