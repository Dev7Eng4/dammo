import { API_V1 } from './config';
import { fetchJson, withSignal, type FetchOptions } from './http';
import type {
  CreateProxyPayload,
  CreateProxyProviderPayload,
  Proxy,
  ProxyFilter,
  ProxyImportResult,
  ProxyProvider,
  ProxyProvidersResponse,
  ProxiesResponse,
  ProxyStats,
  ProxyTestResult,
  UpdateProxyPayload,
  UpdateProxyProviderPayload,
} from '../types/proxy';

export function fetchProxies(
  filter: ProxyFilter = 'all',
  query = '',
  page = 1,
  limit = 20,
  options?: FetchOptions,
) {
  const params = new URLSearchParams();
  if (filter !== 'all') params.set('status', filter);
  if (query.trim()) params.set('q', query.trim());
  params.set('page', String(page));
  params.set('limit', String(limit));
  return fetchJson<ProxiesResponse>(
    `${API_V1}/proxies?${params}`,
    withSignal(undefined, options),
  );
}

export function fetchProxyStats(options?: FetchOptions) {
  return fetchJson<ProxyStats>(`${API_V1}/proxies/stats`, withSignal(undefined, options));
}

export function fetchProxy(id: string, options?: FetchOptions) {
  return fetchJson<Proxy>(`${API_V1}/proxies/${id}`, withSignal(undefined, options));
}

export function createProxy(payload: CreateProxyPayload) {
  return fetchJson<{ item: Proxy }>(`${API_V1}/proxies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function updateProxy(id: string, payload: UpdateProxyPayload) {
  return fetchJson<{ item: Proxy }>(`${API_V1}/proxies/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function archiveProxy(id: string) {
  return fetchJson<{ ok: true }>(`${API_V1}/proxies/${id}`, { method: 'DELETE' });
}

export function testProxy(id: string) {
  return fetchJson<ProxyTestResult>(`${API_V1}/proxies/${id}/test`, { method: 'POST' });
}

export function removeFailedProxies() {
  return fetchJson<{ removed: number }>(`${API_V1}/proxies/bulk/failed`, { method: 'DELETE' });
}

export async function exportProxiesExcel(
  filter: ProxyFilter = 'all',
  query = '',
  ids?: string[],
) {
  const params = new URLSearchParams();
  if (filter !== 'all') params.set('status', filter);
  if (query.trim()) params.set('q', query.trim());
  if (ids && ids.length > 0) params.set('ids', ids.join(','));

  const res = await fetch(`${API_V1}/proxies/export?${params}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Export failed: ${res.status}`);
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? `proxies-${new Date().toISOString().slice(0, 10)}.xlsx`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function importProxiesExcel(file: File): Promise<ProxyImportResult> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_V1}/proxies/import`, {
    method: 'POST',
    body: formData,
  });

  const body = (await res.json()) as ProxyImportResult & { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? `Import failed: ${res.status}`);
  }

  return body;
}

export function fetchProxyProviders(options?: FetchOptions) {
  return fetchJson<ProxyProvidersResponse>(
    `${API_V1}/proxies/providers`,
    withSignal(undefined, options),
  );
}

export function fetchProxyProvider(id: string, options?: FetchOptions) {
  return fetchJson<ProxyProvider>(
    `${API_V1}/proxies/providers/${id}`,
    withSignal(undefined, options),
  );
}

export function createProxyProvider(payload: CreateProxyProviderPayload) {
  return fetchJson<{ item: ProxyProvider }>(`${API_V1}/proxies/providers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function updateProxyProvider(id: string, payload: UpdateProxyProviderPayload) {
  return fetchJson<{ item: ProxyProvider }>(`${API_V1}/proxies/providers/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function deleteProxyProvider(id: string) {
  return fetchJson<{ ok: true }>(`${API_V1}/proxies/providers/${id}`, { method: 'DELETE' });
}

export function setProfileProxy(profileId: string, proxyId: string | null) {
  return fetchJson<{ ok: true }>(`${API_V1}/proxies/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profileId, proxyId }),
  });
}
