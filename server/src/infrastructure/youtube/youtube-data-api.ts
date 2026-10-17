import { env } from '../../config/env.js';
import { AppError } from '../../shared/http/errors.js';

const API_BASE = 'https://www.googleapis.com/youtube/v3';

/** Quota units per list call (https://developers.google.com/youtube/v3/determine_quota_cost). */
export const QUOTA_COST_LIST = 1;

export interface ApiVideo {
  id: string;
  title: string;
  channelId: string;
  publishedAt: string;
  viewCount: number;
  durationSeconds: number;
}

export interface RecentUploads {
  videos: ApiVideo[];
  quotaUnits: number;
}

interface ListResponse<T> {
  items?: T[];
  error?: { code?: number; message?: string; errors?: { reason?: string }[] };
}

export function parseIsoDuration(value: string | undefined): number {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value ?? '');
  if (!match) return 0;
  const [d, h, m, s] = [match[1], match[2], match[3], match[4]].map(part => Number(part ?? 0));
  return d * 86400 + h * 3600 + m * 60 + s;
}

/** A channel's uploads playlist id is its channel id with the `UC` prefix swapped for `UU`. */
export function uploadsPlaylistId(channelId: string): string | null {
  return /^UC[\w-]{22}$/.test(channelId) ? `UU${channelId.slice(2)}` : null;
}

export function isYoutubeDataApiConfigured(): boolean {
  return env.youtubeApiKey.trim() !== '';
}

async function apiGet<T>(endpoint: string, params: Record<string, string>): Promise<ListResponse<T>> {
  const key = env.youtubeApiKey.trim();
  if (!key) {
    throw new AppError('YOUTUBE_API_KEY is not configured', 503, 'YOUTUBE_API_KEY_MISSING');
  }

  const url = new URL(`${API_BASE}/${endpoint}`);
  for (const [name, value] of Object.entries({ ...params, key })) url.searchParams.set(name, value);

  const response = await fetch(url);
  const body = (await response.json().catch(() => ({}))) as ListResponse<T>;
  if (!response.ok) {
    const reason = body.error?.errors?.[0]?.reason;
    const quotaExceeded = reason === 'quotaExceeded' || reason === 'dailyLimitExceeded';
    // The request URL (which carries the key) is deliberately kept out of the message.
    throw new AppError(
      `YouTube Data API ${endpoint} failed: ${body.error?.message ?? response.statusText}`,
      quotaExceeded ? 429 : 502,
      quotaExceeded ? 'YOUTUBE_API_QUOTA_EXCEEDED' : 'YOUTUBE_API_ERROR',
    );
  }
  return body;
}

interface PlaylistItem {
  contentDetails?: { videoId?: string };
}

interface VideoItem {
  id?: string;
  snippet?: { title?: string; channelId?: string; publishedAt?: string };
  statistics?: { viewCount?: string };
  contentDetails?: { duration?: string };
}

/**
 * Latest uploads of one channel: playlistItems.list (1 unit) + videos.list (1 unit).
 * Avoids search.list, which costs 100 units per call.
 */
export async function fetchRecentUploads(channelId: string, maxVideos = 30): Promise<RecentUploads> {
  const playlistId = uploadsPlaylistId(channelId);
  if (!playlistId) return { videos: [], quotaUnits: 0 };

  const limit = Math.min(Math.max(maxVideos, 1), 50);
  let quotaUnits = 0;

  const playlist = await apiGet<PlaylistItem>('playlistItems', {
    part: 'contentDetails',
    playlistId,
    maxResults: String(limit),
  });
  quotaUnits += QUOTA_COST_LIST;

  const ids = (playlist.items ?? [])
    .map(item => item.contentDetails?.videoId)
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) return { videos: [], quotaUnits };

  const details = await apiGet<VideoItem>('videos', {
    part: 'snippet,statistics,contentDetails',
    id: ids.join(','),
    maxResults: String(limit),
  });
  quotaUnits += QUOTA_COST_LIST;

  const videos: ApiVideo[] = [];
  for (const item of details.items ?? []) {
    if (!item.id || !item.snippet?.publishedAt || !item.snippet.title) continue;
    videos.push({
      id: item.id,
      title: item.snippet.title,
      channelId: item.snippet.channelId ?? channelId,
      publishedAt: item.snippet.publishedAt,
      viewCount: Number(item.statistics?.viewCount ?? 0),
      durationSeconds: parseIsoDuration(item.contentDetails?.duration),
    });
  }
  return { videos, quotaUnits };
}
