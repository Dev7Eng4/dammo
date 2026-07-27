import { API_V1 } from './config';
import { fetchJson, withSignal, type FetchOptions } from './http';
import type { AssetKind, AssetFileItem, AssetsListResponse } from '../types/asset';

export function fetchAssets(kind: AssetKind, options?: FetchOptions) {
  return fetchJson<AssetsListResponse>(
    `${API_V1}/assets?kind=${encodeURIComponent(kind)}`,
    withSignal(undefined, options),
  );
}

export function uploadAsset(kind: AssetKind, file: File) {
  const body = new FormData();
  body.append('file', file);
  return fetchJson<{ item: AssetFileItem }>(`${API_V1}/assets/${encodeURIComponent(kind)}`, {
    method: 'POST',
    body,
  });
}

export function deleteAssets(kind: AssetKind, names: string[]) {
  return fetchJson<{ deleted: string[] }>(`${API_V1}/assets/${encodeURIComponent(kind)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ names }),
  });
}
