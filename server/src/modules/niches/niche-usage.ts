import { promptsRepository } from '../prompts/prompts.repository.js';
import { sourceChannelsRepository } from '../source-channels/source-channels.repository.js';
import { youtubeChannelsRepository } from '../youtube-channels/youtube-channels.repository.js';

export interface NicheUsageItem {
  id: string;
  name: string;
}

export interface NicheUsage {
  inUse: boolean;
  prompts: NicheUsageItem[];
  sourceChannels: NicheUsageItem[];
  youtubeChannels: NicheUsageItem[];
}

export function getNicheUsage(key: string): NicheUsage {
  const prompts = promptsRepository
    .findAll()
    .filter((prompt) => {
      const niche = prompt.niche || 'all';
      return niche !== 'all' && niche === key;
    })
    .map((prompt) => ({ id: prompt.id, name: prompt.name }));

  const sourceChannels = sourceChannelsRepository
    .findAll()
    .filter((source) => source.niche === key)
    .map((source) => ({ id: source.id, name: source.name }));

  const youtubeChannels = youtubeChannelsRepository
    .findAll()
    .filter((channel) => channel.niche === key)
    .map((channel) => ({ id: channel.id, name: channel.name }));

  return {
    inUse: prompts.length > 0 || sourceChannels.length > 0 || youtubeChannels.length > 0,
    prompts,
    sourceChannels,
    youtubeChannels,
  };
}
