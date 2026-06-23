import { youtubeDl } from 'youtube-dl-exec';
import { getYoutubeDlCommonOptions } from './youtube-dl-auth.js';
import { inferNiche } from './niche-inferrer.js';
import type { YoutubeChannelMetadata, YtdlpChannelResponse } from './youtube-channel.types.js';

function extractHandle(data: YtdlpChannelResponse): string {
  const uploaderId = data.uploader_id ?? '';
  if (uploaderId.startsWith('@')) return uploaderId;

  const channelUrl = data.channel_url ?? data.uploader_url ?? '';
  const handleMatch = channelUrl.match(/@([^/?#]+)/);
  if (handleMatch) {
    try {
      return `@${decodeURIComponent(handleMatch[1])}`;
    } catch {
      return `@${handleMatch[1]}`;
    }
  }

  if (data.channel_id) return data.channel_id;
  return '@unknown';
}

function mapResponse(data: YtdlpChannelResponse): Omit<YoutubeChannelMetadata, 'niche'> {
  const name = data.channel ?? data.uploader ?? data.title ?? 'Unknown Channel';
  const handle = extractHandle(data);
  const videoCount =
    data.playlist_count ??
    (Array.isArray(data.entries) ? data.entries.filter(entry => entry !== null && typeof entry === 'object').length : undefined);

  return {
    name,
    handle: handle.startsWith('@') ? handle : `@${handle}`,
    channelId: data.channel_id ?? data.id,
    description: data.description,
    videoCount,
    subscriberCount: data.channel_follower_count,
    thumbnailUrl: data.thumbnail,
    categories: data.categories,
  };
}

export async function fetchYoutubeChannelMetadata(channelUrl: string): Promise<YoutubeChannelMetadata> {
  try {
    const raw = await youtubeDl(channelUrl, {
      ...getYoutubeDlCommonOptions(),
      dumpSingleJson: true,
      flatPlaylist: true,
      skipDownload: true,
      noWarnings: true,
      ignoreErrors: true,
    });

    const data = raw as YtdlpChannelResponse;
    const base = mapResponse(data);

    return {
      ...base,
      niche: inferNiche(base.categories, base.description),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown yt-dlp error';
    throw new Error(message);
  }
}
