import { API_V1 } from './config';
import { fetchJson, withSignal, type FetchOptions } from './http';
import type {
  CreateYoutubeChannelPayload,
  UpdateYoutubeChannelPayload,
  YoutubeChannel,
  YoutubeChannelVideo,
  YoutubeChannelVideosResponse,
  YoutubeChannelsResponse,
  YoutubeChannelStats,
  YoutubeChannelTypeFilter,
  YoutubeMonetizationFilter,
  YoutubeVideoCommentsResponse,
  CreateReupVideosResponse,
  CreateReupVideosBatchResponse,
  UploadYoutubeVideosBatchResponse,
} from '../types/youtubeChannel';

export function fetchYoutubeChannelStats(options?: FetchOptions) {
  return fetchJson<YoutubeChannelStats>(
    `${API_V1}/youtube-channels/stats`,
    withSignal(undefined, options),
  );
}

export function fetchYoutubeChannels(
  type: YoutubeChannelTypeFilter = 'all',
  monetization: YoutubeMonetizationFilter = 'all',
  query = '',
  page = 1,
  limit = 20,
  options?: FetchOptions,
) {
  const params = new URLSearchParams();
  if (type !== 'all') params.set('type', type);
  if (monetization !== 'all') params.set('monetization', monetization);
  if (query.trim()) params.set('q', query.trim());
  params.set('page', String(page));
  params.set('limit', String(limit));
  return fetchJson<YoutubeChannelsResponse>(
    `${API_V1}/youtube-channels?${params}`,
    withSignal(undefined, options),
  );
}

export function fetchYoutubeChannel(id: string, options?: FetchOptions) {
  return fetchJson<YoutubeChannel>(
    `${API_V1}/youtube-channels/${id}`,
    withSignal(undefined, options),
  );
}

export function createYoutubeChannel(payload: CreateYoutubeChannelPayload) {
  return fetchJson<{ item: YoutubeChannel }>(`${API_V1}/youtube-channels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function updateYoutubeChannel(id: string, payload: UpdateYoutubeChannelPayload) {
  return fetchJson<{ item: YoutubeChannel }>(`${API_V1}/youtube-channels/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function fetchYoutubeChannelVideos(id: string, options?: FetchOptions) {
  return fetchJson<YoutubeChannelVideosResponse>(
    `${API_V1}/youtube-channels/${id}/videos`,
    withSignal(undefined, options),
  );
}

export function syncYoutubeChannelVideos(id: string) {
  return fetchJson<{ item: YoutubeChannel; videos: YoutubeChannelVideo[]; fetchedAt: string }>(
    `${API_V1}/youtube-channels/${id}/sync-videos`,
    { method: 'POST' },
  );
}

export function fetchYoutubeVideoComments(
  channelId: string,
  videoId: string,
  options?: FetchOptions,
) {
  return fetchJson<YoutubeVideoCommentsResponse>(
    `${API_V1}/youtube-channels/${channelId}/videos/${videoId}/comments`,
    withSignal(undefined, options),
  );
}

export function createYoutubeChannelVideos(id: string) {
  return fetchJson<CreateReupVideosResponse>(
    `${API_V1}/youtube-channels/${id}/create-videos`,
    { method: 'POST' },
  );
}

export function createYoutubeChannelVideosForAll() {
  return fetchJson<CreateReupVideosBatchResponse>(
    `${API_V1}/youtube-channels/create-videos`,
    { method: 'POST' },
  );
}

export function createYoutubeChannelVideosForChannels(channelIds: string[]) {
  return fetchJson<CreateReupVideosBatchResponse>(
    `${API_V1}/youtube-channels/create-videos`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelIds }),
    },
  );
}

export function uploadYoutubeChannelVideos(channelId: string) {
  return fetchJson<UploadYoutubeVideosBatchResponse>(
    `${API_V1}/youtube-channels/${channelId}/upload`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
  );
}

export function uploadYoutubeChannelVideosForAll() {
  return fetchJson<UploadYoutubeVideosBatchResponse>(
    `${API_V1}/youtube-channels/upload-videos`,
    { method: 'POST' },
  );
}

export function uploadYoutubeChannelVideosForChannels(channelIds: string[]) {
  return fetchJson<UploadYoutubeVideosBatchResponse>(
    `${API_V1}/youtube-channels/upload-videos`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelIds }),
    },
  );
}
