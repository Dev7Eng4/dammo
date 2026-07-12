import { youtubeDl } from './youtube-dl-client.js';
import { getYoutubeDlCommonOptions } from './youtube-dl-auth.js';
import type { YoutubeChannelVideo, YtdlpChannelResponse, YtdlpVideoEntry } from './youtube-channel.types.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const ENRICH_CONCURRENCY = 5;

const UNAVAILABLE_TITLE_MARKERS = ['[private video]', '[deleted video]', 'private video', 'members-only', 'member-only'];

const ytdlpBaseOptions = {
  ...getYoutubeDlCommonOptions(),
  skipDownload: true,
  noWarnings: true,
  ignoreErrors: true,
} as const;

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

async function fetchFlatPlaylistEntries(channelUrl: string, options?: { playlistEnd?: number }): Promise<YtdlpVideoEntry[]> {
  const raw = await youtubeDl(buildVideosTabUrl(channelUrl), {
    ...ytdlpBaseOptions,
    dumpSingleJson: true,
    flatPlaylist: true,
    ...(options?.playlistEnd !== undefined ? { playlistEnd: options.playlistEnd } : {}),
  });

  const data = raw as YtdlpChannelResponse;
  return normalizePlaylistEntries(data.entries).filter(entry => !isUnavailableFlatEntry(entry));
}

async function enrichVideoEntry(entry: YtdlpVideoEntry): Promise<YoutubeChannelVideo | null> {
  const videoUrl = buildVideoUrl(entry);
  if (!videoUrl) return null;

  const fromFlat = mapVideoEntry(entry);
  if (!fromFlat) return null;

  try {
    const raw = await youtubeDl(videoUrl, {
      ...ytdlpBaseOptions,
      dumpSingleJson: true,
    });

    return mapVideoEntry(raw as YtdlpVideoEntry) ?? fromFlat;
  } catch {
    return null;
  }
}

async function enrichVideosInBatches(entries: YtdlpVideoEntry[], options?: { maxVideos?: number }): Promise<YoutubeChannelVideo[]> {
  const maxVideos = options?.maxVideos;
  const videos: YoutubeChannelVideo[] = [];

  for (let i = 0; i < entries.length; i += ENRICH_CONCURRENCY) {
    if (maxVideos !== undefined && videos.length >= maxVideos) break;

    const batch = entries.slice(i, i + ENRICH_CONCURRENCY);
    const results = await Promise.all(batch.map(entry => enrichVideoEntry(entry)));

    for (const video of results) {
      if (!video) continue;
      videos.push(video);
      if (maxVideos !== undefined && videos.length >= maxVideos) break;
    }
  }

  return maxVideos !== undefined ? videos.slice(0, maxVideos) : videos;
}

async function fetchPlaylistVideos(
  channelUrl: string,
  options?: { playlistEnd?: number; maxVideos?: number },
): Promise<YoutubeChannelVideo[]> {
  try {
    const entries = await fetchFlatPlaylistEntries(channelUrl, {
      playlistEnd: options?.playlistEnd,
    });

    if (entries.length === 0) return [];

    return enrichVideosInBatches(entries, { maxVideos: options?.maxVideos });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown yt-dlp error';
    throw new Error(message);
  }
}

export async function fetchYoutubeChannelVideos(channelUrl: string, limit = DEFAULT_LIMIT): Promise<YoutubeChannelVideo[]> {
  const cappedLimit = Math.min(Math.max(limit, 1), MAX_LIMIT);
  return fetchPlaylistVideos(channelUrl, {
    playlistEnd: cappedLimit * 2,
    maxVideos: cappedLimit,
  });
}

export async function fetchAllYoutubeChannelVideos(channelUrl: string): Promise<YoutubeChannelVideo[]> {
  return fetchPlaylistVideos(channelUrl);
}
