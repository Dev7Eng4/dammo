import { canonicalizeSourceUrl } from '../../shared/platform/url-parser.js';
import { isUuid } from '../../shared/id.js';
import { sourceChannelsRepository } from '../source-channels/source-channels.repository.js';
import type { SourceChannel } from '../source-channels/source-channels.types.js';
import type { YoutubeChannel } from './youtube-channels.types.js';

export function resolveSourceChannelsFromMapping(sourceMapping: string): SourceChannel[] {
  const parts = sourceMapping
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return [];

  const allSources = sourceChannelsRepository.findAll();
  const sourceById = new Map(allSources.map((source) => [source.id, source]));
  const sourceByUrl = new Map(
    allSources.flatMap((source) => {
      const keys = new Set<string>();
      keys.add(canonicalizeSourceUrl(source.fullUrl));
      keys.add(canonicalizeSourceUrl(source.url));
      if (source.channelId) keys.add(canonicalizeSourceUrl(`https://youtube.com/channel/${source.channelId}`));
      return [...keys].map((key) => [key, source] as const);
    }),
  );

  const matched: SourceChannel[] = [];
  const seen = new Set<string>();

  const add = (source: SourceChannel | undefined) => {
    if (!source || seen.has(source.id)) return;
    seen.add(source.id);
    matched.push(source);
  };

  for (const part of parts) {
    if (isUuid(part)) {
      add(sourceById.get(part));
      continue;
    }

    add(sourceByUrl.get(canonicalizeSourceUrl(part)));
  }

  return matched;
}

export function resolveSourceChannelsByIds(ids: string[]): SourceChannel[] {
  const normalized = [...new Set(ids.map(id => id.trim()).filter(Boolean))];
  if (normalized.length === 0) return [];

  const sourceById = new Map(sourceChannelsRepository.findAll().map(source => [source.id, source]));
  const matched: SourceChannel[] = [];
  const seen = new Set<string>();

  for (const id of normalized) {
    const source = sourceById.get(id);
    if (!source || seen.has(source.id)) continue;
    seen.add(source.id);
    matched.push(source);
  }

  return matched;
}

export function resolveSourceChannelNamesOnly(channel: YoutubeChannel): string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  const add = (name: string) => {
    if (!name || seen.has(name)) return;
    seen.add(name);
    names.push(name);
  };

  for (const source of resolveSourceChannelsByIds(channel.sourceChannels ?? [])) {
    add(source.name);
  }

  for (const sourceId of [channel.reupVideoSourceId, channel.reupAudioSourceId]) {
    if (!sourceId) continue;
    const source = sourceChannelsRepository.findById(sourceId);
    if (source) add(source.name);
  }

  return names;
}

export function resolveBackgroundFootageNamesOnly(channel: YoutubeChannel): string[] {
  if (channel.backgroundFootageMode === 'local') {
    return ['Local'];
  }

  return resolveSourceChannelsByIds(channel.backgroundFootageSources ?? []).map(source => source.name);
}

export function resolveSourceNamesForChannel(channel: YoutubeChannel): string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  const add = (name: string) => {
    if (!name || seen.has(name)) return;
    seen.add(name);
    names.push(name);
  };

  for (const source of resolveSourceChannelsByIds(channel.sourceChannels ?? [])) {
    add(source.name);
  }

  for (const sourceId of [
    ...(channel.backgroundFootageSources ?? []),
    channel.reupVideoSourceId,
    channel.reupAudioSourceId,
  ]) {
    if (!sourceId) continue;
    const source = sourceChannelsRepository.findById(sourceId);
    if (source) add(source.name);
  }

  return names;
}
