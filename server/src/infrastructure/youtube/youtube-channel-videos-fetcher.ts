import { youtubeDl } from './youtube-dl-client.js';
import { getYoutubeDlPublicOptions } from './youtube-dl-auth.js';
import type { YoutubeChannelVideo, YtdlpChannelResponse, YtdlpVideoEntry } from './youtube-channel.types.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const UNAVAILABLE_TITLE_MARKERS = ['[private video]', '[deleted video]', 'private video', 'members-only', 'member-only'];

function buildVideosTabUrl(channelUrl: string): string {
  const trimmed = channelUrl.replace(/\/$/, '');
  if (trimmed.endsWith('/videos')) return trimmed;
  return `${trimmed}/videos`;
}

function buildVideoUrl(entry: YtdlpVideoEntry): string | null {
  const id = entry.id?.trim();
  if (!id) return null;
  return entry.webpage_url ?? entry.url ?? `https://www.youtube.com/watch?v=${id}`;
}

function isUnavailableFlatEntry(entry: YtdlpVideoEntry): boolean {
  const title = entry.title?.trim().toLowerCase() ?? '';
  if (!title) return true;
  return UNAVAILABLE_TITLE_MARKERS.some(marker => title.includes(marker));
}

function mapVideoEntry(entry: YtdlpVideoEntry): YoutubeChannelVideo | null {
  const id = entry.id?.trim();
  const title = entry.title?.trim();
  if (!id || !title || isUnavailableFlatEntry(entry)) return null;

  const url = buildVideoUrl(entry);
  if (!url) return null;

  return {
    id,
    title,
    url,
    viewCount: entry.view_count,
    likeCount: entry.like_count,
    commentCount: entry.comment_count,
    duration: entry.duration,
  };
}

function normalizePlaylistEntries(entries: unknown): YtdlpVideoEntry[] {
  if (!Array.isArray(entries)) return [];
  return entries.filter((entry): entry is YtdlpVideoEntry => entry !== null && typeof entry === 'object');
}

async function fetchFlatPlaylistVideos(
  channelUrl: string,
  options?: { playlistEnd?: number; maxVideos?: number },
): Promise<YoutubeChannelVideo[]> {
  try {
    const raw = await youtubeDl(buildVideosTabUrl(channelUrl), {
      ...getYoutubeDlPublicOptions(),
      ...(options?.playlistEnd !== undefined ? { playlistEnd: options.playlistEnd } : {}),
    });

    const data = raw as YtdlpChannelResponse;
    const videos = normalizePlaylistEntries(data.entries)
      .map(mapVideoEntry)
      .filter((video): video is YoutubeChannelVideo => video !== null);

    if (options?.maxVideos !== undefined) {
      return videos.slice(0, options.maxVideos);
    }

    return videos;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown yt-dlp error';
    throw new Error(message);
  }
}

export async function fetchYoutubeChannelVideos(channelUrl: string, limit = DEFAULT_LIMIT): Promise<YoutubeChannelVideo[]> {
  const cappedLimit = Math.min(Math.max(limit, 1), MAX_LIMIT);
  return fetchFlatPlaylistVideos(channelUrl, {
    playlistEnd: cappedLimit * 2,
    maxVideos: cappedLimit,
  });
}

export async function fetchAllYoutubeChannelVideos(channelUrl: string): Promise<YoutubeChannelVideo[]> {
  return fetchFlatPlaylistVideos(channelUrl);
}
