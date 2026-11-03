import { API_V1 } from './config';
import { fetchJson, withSignal, type FetchOptions } from './http';
import type {
  CreateSmallVideoGroupInput,
  DownloadSmallVideoInput,
  MoveSmallVideoInput,
  SmallVideoGroupListItem,
  SmallVideoGroupMediaItem,
} from '../types/smallVideoGroup';

export function fetchSmallVideoGroups(options?: FetchOptions) {
  return fetchJson<{ items: SmallVideoGroupListItem[] }>(
    `${API_V1}/small-video-groups`,
    withSignal(undefined, options),
  );
}

export function createSmallVideoGroup(input: CreateSmallVideoGroupInput) {
  return fetchJson<{ item: SmallVideoGroupListItem }>(`${API_V1}/small-video-groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function deleteSmallVideoGroup(id: string) {
  return fetchJson<{ ok: true }>(`${API_V1}/small-video-groups/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function fetchSmallVideoGroupMedia(id: string, options?: FetchOptions) {
  return fetchJson<{ items: SmallVideoGroupMediaItem[] }>(
    `${API_V1}/small-video-groups/${encodeURIComponent(id)}/media`,
    withSignal(undefined, options),
  );
}

export function smallVideoGroupMediaUrl(id: string, filename: string): string {
  return `${API_V1}/small-video-groups/${encodeURIComponent(id)}/media/${encodeURIComponent(filename)}`;
}

export function uploadSmallVideoGroupMedia(id: string, file: File) {
  const body = new FormData();
  body.append('file', file);
  return fetchJson<{ item: SmallVideoGroupMediaItem }>(
    `${API_V1}/small-video-groups/${encodeURIComponent(id)}/media`,
    { method: 'POST', body },
  );
}

/** Download a video from a URL into a group, or into the ungrouped folder when `groupId` is omitted. */
export function downloadSmallVideoFromUrl(input: DownloadSmallVideoInput) {
  return fetchJson<{ item: SmallVideoGroupMediaItem & { groupId: string | null } }>(
    `${API_V1}/small-video-groups/download`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
}

/** Move a video between groups; `null` group id = the ungrouped folder. */
export function moveSmallVideo(input: MoveSmallVideoInput) {
  return fetchJson<{ item: SmallVideoGroupMediaItem & { groupId: string | null } }>(
    `${API_V1}/small-video-groups/move`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
}

export function deleteSmallVideoGroupMedia(id: string, names: string[]) {
  return fetchJson<{ deleted: string[] }>(
    `${API_V1}/small-video-groups/${encodeURIComponent(id)}/media`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names }),
    },
  );
}
