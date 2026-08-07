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
  UpdateYoutubeVideoContentPayload,
  YoutubeVideoContent,
  MarkYoutubeVideoUploadedResponse,
  ThumbnailBackgroundItem,
  ChannelAvatarItem,
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

export function fetchYoutubeChannelPendingVideos(id: string, options?: FetchOptions) {
  return fetchJson<YoutubeChannelVideosResponse>(
    `${API_V1}/youtube-channels/${id}/videos/pending`,
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

export function fetchYoutubeVideoContent(
  channelId: string,
  videoId: string,
  options?: FetchOptions,
) {
  return fetchJson<YoutubeVideoContent>(
    `${API_V1}/youtube-channels/${channelId}/videos/${videoId}/content`,
    withSignal(undefined, options),
  );
}

export function updateYoutubeVideoContent(
  channelId: string,
  videoId: string,
  payload: UpdateYoutubeVideoContentPayload,
  thumbnail?: File | null,
) {
  const formData = new FormData();
  formData.append('title', payload.title);
  formData.append('description', payload.description);
  formData.append('tags', JSON.stringify(payload.tags));
  if (thumbnail) formData.append('thumbnail', thumbnail);

  return fetchJson<YoutubeVideoContent>(
    `${API_V1}/youtube-channels/${channelId}/videos/${videoId}/content`,
    {
      method: 'PATCH',
      body: formData,
    },
  );
}

export function markYoutubeVideoUploaded(channelId: string, videoId: string) {
  return fetchJson<MarkYoutubeVideoUploadedResponse>(
    `${API_V1}/youtube-channels/${channelId}/videos/${videoId}/mark-uploaded`,
    { method: 'POST' },
  );
}

export function deleteYoutubeChannelVideos(channelId: string, videoIds: string[]) {
  return fetchJson<{ deleted: string[] }>(
    `${API_V1}/youtube-channels/${channelId}/videos`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoIds }),
    },
  );
}

export function deleteAllUploadedVideos(options?: { deletePreparedVideos?: boolean }) {
  return fetchJson<{
    channelsProcessed: number;
    deletedFolders: number;
    deletedPreparedVideos: number;
  }>(`${API_V1}/youtube-channels/uploaded-videos`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deletePreparedVideos: options?.deletePreparedVideos ?? false }),
  });
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

export type ThumbnailBackgroundScope =
  | { channelId: string }
  | { tempSessionId: string };

function thumbnailBackgroundsBasePath(scope: ThumbnailBackgroundScope): string {
  if ('channelId' in scope) {
    return `${API_V1}/youtube-channels/${encodeURIComponent(scope.channelId)}/thumbnail-backgrounds`;
  }
  return `${API_V1}/youtube-channels/thumbnail-backgrounds/temp/${encodeURIComponent(scope.tempSessionId)}`;
}

export function thumbnailBackgroundFileUrl(scope: ThumbnailBackgroundScope, filename: string): string {
  return `${thumbnailBackgroundsBasePath(scope)}/${encodeURIComponent(filename)}`;
}

export function listThumbnailBackgrounds(scope: ThumbnailBackgroundScope, options?: FetchOptions) {
  return fetchJson<{ items: ThumbnailBackgroundItem[] }>(
    thumbnailBackgroundsBasePath(scope),
    withSignal(undefined, options),
  );
}

export function uploadThumbnailBackground(scope: ThumbnailBackgroundScope, file: File) {
  const body = new FormData();
  body.append('file', file);
  return fetchJson<{ item: ThumbnailBackgroundItem }>(thumbnailBackgroundsBasePath(scope), {
    method: 'POST',
    body,
  });
}

export function deleteThumbnailBackground(scope: ThumbnailBackgroundScope, filename: string) {
  return fetchJson<{ deleted: string }>(thumbnailBackgroundFileUrl(scope, filename), {
    method: 'DELETE',
  });
}

export function uploadYoutubeChannelAvatar(channelId: string, file: File) {
  const body = new FormData();
  body.append('file', file);
  return fetchJson<{ item: ChannelAvatarItem }>(
    `${API_V1}/youtube-channels/${encodeURIComponent(channelId)}/avatar`,
    {
      method: 'POST',
      body,
    },
  );
}

export function uploadYoutubeChannelAvatarTemp(sessionId: string, file: File) {
  const body = new FormData();
  body.append('file', file);
  return fetchJson<{ item: ChannelAvatarItem }>(
    `${API_V1}/youtube-channels/avatars/temp/${encodeURIComponent(sessionId)}`,
    {
      method: 'POST',
      body,
    },
  );
}
