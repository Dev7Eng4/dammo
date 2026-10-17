import { youtubeDl } from './youtube-dl-client.js';
import { getYoutubeDlPublicOptions } from './youtube-dl-auth.js';
import { inferNiche } from './niche-inferrer.js';
import { pickChannelAvatarUrl } from './channel-avatar.js';
import { buildChannelTabUrl, isMissingChannelTabError, METADATA_FALLBACK_TABS } from './channel-tabs.js';
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
    avatarUrl: pickChannelAvatarUrl(data.thumbnails),
    categories: data.categories,
  };
}

async function dumpChannel(url: string): Promise<YtdlpChannelResponse> {
  return (await youtubeDl(url, getYoutubeDlPublicOptions())) as YtdlpChannelResponse;
}

export async function fetchYoutubeChannelMetadata(channelUrl: string): Promise<YoutubeChannelMetadata> {
  let data: YtdlpChannelResponse;

  try {
    data = await dumpChannel(channelUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown yt-dlp error';
    if (!isMissingChannelTabError(message)) throw new Error(message);

    // The bare channel URL resolves to the videos tab, which this channel lacks: read another tab instead.
    let fallback: YtdlpChannelResponse | undefined;
    for (const tab of METADATA_FALLBACK_TABS) {
      try {
        fallback = await dumpChannel(buildChannelTabUrl(channelUrl, tab));
        break;
      } catch (fallbackErr) {
        const fallbackMessage = fallbackErr instanceof Error ? fallbackErr.message : '';
        if (!isMissingChannelTabError(fallbackMessage)) throw new Error(fallbackMessage || message);
      }
    }
    if (!fallback) throw new Error(message);
    data = fallback;
  }

  const base = mapResponse(data);
  return {
    ...base,
    niche: inferNiche(base.categories),
  };
}
