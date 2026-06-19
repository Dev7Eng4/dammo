import { canonicalizeSourceUrl } from '../../shared/platform/url-parser.js';
import { youtubeChannelsRepository } from '../youtube-channels/youtube-channels.repository.js';
import type { SourceChannel } from './source-channels.types.js';

export interface ChannelUsingSource {
  id: string;
  name: string;
}

export function findChannelsUsingSource(source: SourceChannel): ChannelUsingSource[] {
  const canonical = canonicalizeSourceUrl(source.fullUrl);

  return youtubeChannelsRepository
    .findAll()
    .filter((channel) => {
      if (channel.backgroundFootageSourceId === source.id) return true;
      if (channel.reupVideoSourceId === source.id) return true;
      if (channel.reupAudioSourceId === source.id) return true;
      if (!channel.sourceMapping.trim()) return false;

      return channel.sourceMapping
        .split(',')
        .some((part) => canonicalizeSourceUrl(part.trim()) === canonical);
    })
    .map((channel) => ({ id: channel.id, name: channel.name }));
}
