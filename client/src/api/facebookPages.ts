import { API_V1 } from './config';
import { fetchJson, withSignal, type FetchOptions } from './http';
import type {
  CreateFacebookPagePayload,
  FacebookPage,
  FacebookPageStatusFilter,
  FacebookPagesResponse,
  PostFacebookPagePayload,
  UpdateFacebookPagePayload,
  UploadFacebookVideoPayload,
} from '../types/facebookPage';

const BASE = `${API_V1}/facebook-pages`;
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function fetchFacebookPages(
  status: FacebookPageStatusFilter = 'all',
  query = '',
  options?: FetchOptions,
) {
  const params = new URLSearchParams();
  if (status !== 'all') params.set('status', status);
  if (query.trim()) params.set('q', query.trim());
  return fetchJson<FacebookPagesResponse>(`${BASE}?${params}`, withSignal(undefined, options));
}

export function createFacebookPage(payload: CreateFacebookPagePayload) {
  return fetchJson<{ item: FacebookPage }>(BASE, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

export function updateFacebookPage(id: string, payload: UpdateFacebookPagePayload) {
  return fetchJson<{ item: FacebookPage }>(`${BASE}/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

export function deleteFacebookPage(id: string) {
  return fetchJson<{ ok: boolean }>(`${BASE}/${id}`, { method: 'DELETE' });
}

export function createFacebookPageOnFacebook(id: string) {
  return fetchJson<{ item: FacebookPage }>(`${BASE}/${id}/create-on-facebook`, { method: 'POST' });
}

export function postToFacebookPage(id: string, payload: PostFacebookPagePayload) {
  return fetchJson<{ item: FacebookPage }>(`${BASE}/${id}/post`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

export function uploadFacebookPageVideo(id: string, payload: UploadFacebookVideoPayload) {
  return fetchJson<{ item: FacebookPage }>(`${BASE}/${id}/upload-video`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}
