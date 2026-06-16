import { API_V1 } from './config';
import type {
  CreateSourceChannelPayload,
  SourceChannel,
  SourceChannelsResponse,
  SourceChannelVideosResponse,
  SourceChannelVideo,
  SourcePlatformFilter,
  SourcePurposeFilter,
  SourceRiskFilter,
  SourceVideoDurationFilter,
} from '../types/sourceChannel';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchSourceChannels(
  platform: SourcePlatformFilter = 'all',
  purpose: SourcePurposeFilter = 'all',
  risk: SourceRiskFilter = 'all',
  query = '',
  page = 1,
  limit = 20,
) {
  const params = new URLSearchParams();
  if (platform !== 'all') params.set('platform', platform);
  if (purpose !== 'all') params.set('purpose', purpose);
  if (risk !== 'all') params.set('risk', risk);
  if (query.trim()) params.set('q', query.trim());
  params.set('page', String(page));
  params.set('limit', String(limit));
  return fetchJson<SourceChannelsResponse>(`${API_V1}/source-channels?${params}`);
}

export function fetchSourceChannel(id: string) {
  return fetchJson<SourceChannel>(`${API_V1}/source-channels/${id}`);
}

export function fetchSourceChannelVideos(
  id: string,
  page = 1,
  limit = 20,
  duration: SourceVideoDurationFilter = 'all',
) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    duration,
  });
  return fetchJson<SourceChannelVideosResponse>(
    `${API_V1}/source-channels/${id}/videos?${params}`,
  );
}

export function createSourceChannel(payload: CreateSourceChannelPayload) {
  return fetchJson<{ item: SourceChannel }>(`${API_V1}/source-channels`, {
    method: 'POST',
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
