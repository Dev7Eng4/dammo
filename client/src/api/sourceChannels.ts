import { API_V1 } from './config';
import { fetchJson, withSignal, type FetchOptions } from './http';import type {
  CreateSourceChannelPayload,
  SourceChannel,
  SourceChannelsResponse,
  SourceChannelVideosResponse,
  SourceChannelVideo,
  SourcePlatformFilter,
  SourcePurposeFilter,
  SourceRiskFilter,
  SourceVideoDurationFilter,
  UpdateSourceChannelPayload,
  SourceChannelUsage,
} from '../types/sourceChannel';

export function fetchSourceChannels(
  platform: SourcePlatformFilter = 'all',
  purpose: SourcePurposeFilter = 'all',
  risk: SourceRiskFilter = 'all',
  query = '',
  page = 1,
  limit = 20,
  options?: FetchOptions,
) {
  const params = new URLSearchParams();
  if (platform !== 'all') params.set('platform', platform);
  if (purpose !== 'all') params.set('purpose', purpose);
  if (risk !== 'all') params.set('risk', risk);
  if (query.trim()) params.set('q', query.trim());
  params.set('page', String(page));
  params.set('limit', String(limit));
  return fetchJson<SourceChannelsResponse>(
    `${API_V1}/source-channels?${params}`,
    withSignal(undefined, options),
  );
}

export function fetchSourceChannel(id: string, options?: FetchOptions) {
  return fetchJson<SourceChannel>(
    `${API_V1}/source-channels/${id}`,
    withSignal(undefined, options),
  );
}

export function fetchSourceChannelVideos(
  id: string,
  page = 1,
  limit = 20,
  duration: SourceVideoDurationFilter = 'all',
  options?: FetchOptions,
) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    duration,
  });
  return fetchJson<SourceChannelVideosResponse>(
    `${API_V1}/source-channels/${id}/videos?${params}`,
    withSignal(undefined, options),
  );
}

export function createSourceChannel(payload: CreateSourceChannelPayload) {
  return fetchJson<{ item: SourceChannel }>(`${API_V1}/source-channels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function updateSourceChannel(id: string, payload: UpdateSourceChannelPayload) {
  return fetchJson<{ item: SourceChannel }>(`${API_V1}/source-channels/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function refreshSourceChannel(id: string) {
  return fetchJson<{ item: SourceChannel; videos: SourceChannelVideo[] }>(
    `${API_V1}/source-channels/${id}/refresh`,
    { method: 'POST' },
  );
}

export function fetchSourceChannelUsage(id: string, options?: FetchOptions) {
  return fetchJson<SourceChannelUsage>(
    `${API_V1}/source-channels/${id}/usage`,
    withSignal(undefined, options),
  );
}

export async function deleteSourceChannel(id: string) {
  const res = await fetch(`${API_V1}/source-channels/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error =
      body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `Request failed: ${res.status}`;
    throw new Error(error);
  }
}