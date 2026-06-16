import { API_V1 } from './config';
import type {
  CreateYoutubeChannelPayload,
  YoutubeChannel,
  YoutubeChannelsResponse,
  YoutubeChannelStats,
  YoutubeChannelTypeFilter,
  YoutubeMonetizationFilter,
} from '../types/youtubeChannel';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchYoutubeChannelStats() {
  return fetchJson<YoutubeChannelStats>(`${API_V1}/youtube-channels/stats`);
}

export function fetchYoutubeChannels(
  type: YoutubeChannelTypeFilter = 'all',
  monetization: YoutubeMonetizationFilter = 'all',
  query = '',
  page = 1,
  limit = 20,
) {
  const params = new URLSearchParams();
  if (type !== 'all') params.set('type', type);
  if (monetization !== 'all') params.set('monetization', monetization);
  if (query.trim()) params.set('q', query.trim());
  params.set('page', String(page));
  params.set('limit', String(limit));
  return fetchJson<YoutubeChannelsResponse>(`${API_V1}/youtube-channels?${params}`);
}

export function fetchYoutubeChannel(id: string) {
  return fetchJson<YoutubeChannel>(`${API_V1}/youtube-channels/${id}`);
}

export function createYoutubeChannel(payload: CreateYoutubeChannelPayload) {
  return fetchJson<{ item: YoutubeChannel }>(`${API_V1}/youtube-channels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
