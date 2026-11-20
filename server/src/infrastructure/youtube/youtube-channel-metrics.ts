import { AppError } from '../../shared/http/errors.js';
import { apiGet, parseIsoDuration, QUOTA_COST_LIST, uploadsPlaylistId } from './youtube-data-api.js';

/**
 * Public channel / video numbers from the YouTube Data API v3 — what the "Chỉ số kênh" brain reads.
 * CTR, retention and revenue are Studio-only (YouTube Analytics API + OAuth), not available here.
 */

export interface ChannelRef {
  /** UC… channel id (preferred). */
  channelId?: string;
  /** @handle, used when no channel id is known. */
  handle?: string;
}

export interface ApiChannelStatistics {
  channelId: string;
  title: string;
  handle?: string;
  description?: string;
  publishedAt?: string;
  thumbnailUrl?: string;
  country?: string;
  /** null when the channel hides its subscriber count. */
  subscriberCount: number | null;
  viewCount: number;
  videoCount: number;
}

export interface ApiVideoMetrics {
  id: string;
  title: string;
  publishedAt: string;
  durationSeconds: number;
  viewCount: number;
  /** null when the owner hides likes / disables comments. */
  likeCount: number | null;
  commentCount: number | null;
  tags?: string[];
  categoryId?: string;
  defaultAudioLanguage?: string;
  thumbnailUrl?: string;
}

export interface ChannelMetrics {
  channel: ApiChannelStatistics;
  videos: ApiVideoMetrics[];
  fetchedAt: string;
  /** Data API quota units this call used (10,000 / day per key by default). */
  quotaUnits: number;
}

type Thumbnails = Record<string, { url?: string }>;

interface ChannelItem {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    customUrl?: string;
    publishedAt?: string;
    country?: string;
    thumbnails?: Thumbnails;
  };
  statistics?: { viewCount?: string; subscriberCount?: string; hiddenSubscriberCount?: boolean; videoCount?: string };
}

interface PlaylistItem {
  contentDetails?: { videoId?: string };
}

interface VideoItem {
  id?: string;
  snippet?: {
    title?: string;
    publishedAt?: string;
    tags?: string[];
    categoryId?: string;
    defaultAudioLanguage?: string;
    thumbnails?: Thumbnails;
  };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration?: string };
}

const UC_ID = /^UC[\w-]{22}$/;

function bestThumbnail(thumbnails: Thumbnails | undefined): string | undefined {
  return thumbnails?.high?.url ?? thumbnails?.medium?.url ?? thumbnails?.default?.url;
}

function optionalCount(value: string | undefined): number | null {
  return value === undefined ? null : Number(value);
}

/** Channel totals by UC id or @handle (channels.list, 1 unit). null when nothing matches. */
export async function fetchChannelStatistics(ref: ChannelRef, apiKey?: string): Promise<ApiChannelStatistics | null> {
  const params: Record<string, string> = { part: 'snippet,statistics' };
  const handle = ref.handle?.trim();
  if (ref.channelId && UC_ID.test(ref.channelId)) params.id = ref.channelId;
  else if (handle) params.forHandle = handle.startsWith('@') ? handle : `@${handle}`;
  else {
    throw new AppError('Kênh chưa có channel id (UC…) hoặc @handle để gọi YouTube API', 400, 'YOUTUBE_CHANNEL_REF_MISSING');
  }

  const body = await apiGet<ChannelItem>('channels', params, apiKey);
  const item = body.items?.[0];
  if (!item?.id) return null;
  const stats = item.statistics;
  return {
    channelId: item.id,
    title: item.snippet?.title ?? '',
    handle: item.snippet?.customUrl,
    description: item.snippet?.description,
    publishedAt: item.snippet?.publishedAt,
    thumbnailUrl: bestThumbnail(item.snippet?.thumbnails),
    country: item.snippet?.country,
    subscriberCount: stats?.hiddenSubscriberCount ? null : optionalCount(stats?.subscriberCount),
    viewCount: Number(stats?.viewCount ?? 0),
    videoCount: Number(stats?.videoCount ?? 0),
  };
}

/**
 * Channel totals + the latest `maxVideos` uploads with views / likes / comments / duration.
 * Cost: 1 (channels) + ceil(n/50) (playlistItems) + ceil(n/50) (videos) units — never search.list.
 */
export async function fetchChannelMetrics(
  ref: ChannelRef,
  options: { apiKey?: string; maxVideos?: number } = {},
): Promise<ChannelMetrics> {
  const maxVideos = Math.min(Math.max(Math.round(options.maxVideos ?? 50), 1), 500);
  const { apiKey } = options;
  let quotaUnits = QUOTA_COST_LIST;

  const channel = await fetchChannelStatistics(ref, apiKey);
  if (!channel) throw new AppError('YouTube API không tìm thấy kênh này', 404, 'YOUTUBE_CHANNEL_NOT_FOUND');

  const playlistId = uploadsPlaylistId(channel.channelId);
  const ids: string[] = [];
  let pageToken: string | undefined;
  while (playlistId && ids.length < maxVideos) {
    const page = await apiGet<PlaylistItem>(
      'playlistItems',
      {
        part: 'contentDetails',
        playlistId,
        maxResults: String(Math.min(50, maxVideos - ids.length)),
        ...(pageToken ? { pageToken } : {}),
      },
      apiKey,
    );
    quotaUnits += QUOTA_COST_LIST;
    for (const item of page.items ?? []) {
      if (item.contentDetails?.videoId) ids.push(item.contentDetails.videoId);
    }
    pageToken = page.nextPageToken;
    if (!pageToken) break;
  }

  const videos: ApiVideoMetrics[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const details = await apiGet<VideoItem>(
      'videos',
      { part: 'snippet,statistics,contentDetails', id: ids.slice(i, i + 50).join(','), maxResults: '50' },
      apiKey,
    );
    quotaUnits += QUOTA_COST_LIST;
    for (const item of details.items ?? []) {
      if (!item.id || !item.snippet?.publishedAt) continue;
      videos.push({
        id: item.id,
        title: item.snippet.title ?? '',
        publishedAt: item.snippet.publishedAt,
        durationSeconds: parseIsoDuration(item.contentDetails?.duration),
        viewCount: Number(item.statistics?.viewCount ?? 0),
        likeCount: optionalCount(item.statistics?.likeCount),
        commentCount: optionalCount(item.statistics?.commentCount),
        tags: item.snippet.tags,
        categoryId: item.snippet.categoryId,
        defaultAudioLanguage: item.snippet.defaultAudioLanguage,
        thumbnailUrl: bestThumbnail(item.snippet.thumbnails),
      });
    }
  }
  videos.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return { channel, videos, fetchedAt: new Date().toISOString(), quotaUnits };
}
