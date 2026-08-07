import { API_V1 } from './config';
import { fetchJson, withSignal, type FetchOptions } from './http';
import type { AssetKind, AssetFileItem, AssetsListResponse } from '../types/asset';

export function fetchAssets(kind: AssetKind, options?: FetchOptions) {
  return fetchJson<AssetsListResponse>(
    `${API_V1}/assets?kind=${encodeURIComponent(kind)}`,
    withSignal(undefined, options),
  );
}

export function assetFileUrl(kind: AssetKind, filename: string): string {
  return `${API_V1}/assets/${encodeURIComponent(kind)}/${encodeURIComponent(filename)}`;
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

export type PrepareKeyColor = 'green' | 'black';

export function prepareAssetColor(kind: AssetKind, filename: string, keyColor: PrepareKeyColor = 'green') {
  return fetchJson<{ prepared: boolean; cached: boolean; keyColor: PrepareKeyColor }>(
    `${API_V1}/assets/${encodeURIComponent(kind)}/${encodeURIComponent(filename)}/prepare-color`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyColor }),
    },
  );
}
