import { youtubeChannelsRepository } from '../youtube-channels/youtube-channels.repository.js';
import type { SourceChannel } from './source-channels.types.js';

export interface ChannelUsingSource {
  id: string;
  name: string;
}

export function findChannelsUsingSource(source: SourceChannel): ChannelUsingSource[] {
  return youtubeChannelsRepository
    .findAll()
    .filter((channel) => {
      if (channel.backgroundFootageSources?.includes(source.id)) return true;
      if (channel.reupVideoSourceId === source.id) return true;
      if (channel.reupAudioSourceId === source.id) return true;
      if (!channel.sourceChannels.length) return false;

      return channel.sourceChannels.includes(source.id);
    })
    .map((channel) => ({ id: channel.id, name: channel.name }));
}
