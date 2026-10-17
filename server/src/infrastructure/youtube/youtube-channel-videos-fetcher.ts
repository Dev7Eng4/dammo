import { youtubeDl } from './youtube-dl-client.js';
import { getYoutubeDlPublicOptions } from './youtube-dl-auth.js';
import type { YoutubeChannelVideo, YtdlpChannelResponse, YtdlpVideoEntry } from './youtube-channel.types.js';
import {
  buildChannelTabUrl,
  isMissingChannelTabError,
  VIDEO_FALLBACK_TABS,
  type ChannelTab,
} from './channel-tabs.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const UNAVAILABLE_TITLE_MARKERS = ['[private video]', '[deleted video]', 'private video', 'members-only', 'member-only'];

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
    publishedAt: resolvePublishedAt(entry),
  };
}

function resolvePublishedAt(entry: YtdlpVideoEntry): string | undefined {
  const unixSeconds = entry.release_timestamp ?? entry.timestamp;
  if (typeof unixSeconds === 'number' && Number.isFinite(unixSeconds) && unixSeconds > 0) {
    return new Date(unixSeconds * 1000).toISOString();
  }

  const compact = entry.upload_date?.trim();
  const match = compact?.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`;

  return undefined;
}

function normalizePlaylistEntries(entries: unknown): YtdlpVideoEntry[] {
  if (!Array.isArray(entries)) return [];
  return entries.filter((entry): entry is YtdlpVideoEntry => entry !== null && typeof entry === 'object');
}

async function fetchTabVideos(
  channelUrl: string,
  tab: ChannelTab,
  options?: { playlistEnd?: number },
): Promise<YoutubeChannelVideo[]> {
  const raw = await youtubeDl(buildChannelTabUrl(channelUrl, tab), {
    ...getYoutubeDlPublicOptions(),
    // Flat channel listings carry no dates; this makes yt-dlp derive them from "N days ago" text.
    extractorArgs: 'youtubetab:approximate_date',
    ...(options?.playlistEnd !== undefined ? { playlistEnd: options.playlistEnd } : {}),
  } as Parameters<typeof youtubeDl>[1]);

  const data = raw as YtdlpChannelResponse;
  return normalizePlaylistEntries(data.entries)
    .map(mapVideoEntry)
    .filter((video): video is YoutubeChannelVideo => video !== null);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown yt-dlp error';
}

async function fetchFlatPlaylistVideos(
  channelUrl: string,
  options?: { playlistEnd?: number; maxVideos?: number },
): Promise<YoutubeChannelVideo[]> {
  let videos: YoutubeChannelVideo[];

  try {
    videos = await fetchTabVideos(channelUrl, 'videos', options);
  } catch (err) {
    const message = errorMessage(err);
    if (!isMissingChannelTabError(message)) throw new Error(message);

    // No regular videos (new channel, or Shorts/streams only): use the other tabs; none is a valid empty result.
    videos = [];
    const seen = new Set<string>();
    for (const tab of VIDEO_FALLBACK_TABS) {
      try {
        for (const video of await fetchTabVideos(channelUrl, tab, options)) {
          if (seen.has(video.id)) continue;
          seen.add(video.id);
          videos.push(video);
        }
      } catch (fallbackErr) {
        const fallbackMessage = errorMessage(fallbackErr);
        if (!isMissingChannelTabError(fallbackMessage)) throw new Error(fallbackMessage);
      }
    }
  }

  return options?.maxVideos !== undefined ? videos.slice(0, options.maxVideos) : videos;
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
