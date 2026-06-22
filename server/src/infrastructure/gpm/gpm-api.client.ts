import { env } from '../../config/env.js';
import { AppError } from '../../shared/http/errors.js';

export interface GpmEnvelope<T> {
  success: boolean;
  data: T;
  message: string;
  sender?: string;
}

export interface GpmPaginated<T> {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
  data: T[];
}

export interface GpmBrowserInfo {
  name: string;
  version: string;
}

export interface GpmProfile {
  id: string;
  name: string;
  group_id: string;
  storage_path?: string;
  raw_proxy?: string;
  browser?: GpmBrowserInfo;
  os?: string;
  note?: string;
  created_at?: string;
  updated_at?: string;
  tags?: string[];
  fingerprint?: Record<string, unknown>;
}

export interface GpmGroup {
  id: string;
  name: string;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
  creator?: string | null;
}

export interface GpmStartResult {
  profile_id: string;
  driver_path?: string;
  remote_debugging_port?: number;
  websocket_debugging_url?: string;
  addition_info?: {
    process_id?: number;
    profile_name?: string;
    window_handle?: number;
    exec_time?: number;
  };
}

export interface GpmConnectionStatus {
  connected: boolean;
  sender?: string;
  baseUrl: string;
  message?: string;
}

export interface GpmListQuery {
  page?: number;
  page_size?: number;
  search?: string;
  sort?: number;
}

export interface GpmCreateProfileInput {
  name: string;
  group_id?: string | null;
  raw_proxy?: string;
  note?: string | null;
}

export interface GpmUpdateProfileInput {
  name?: string;
  group_id?: string | null;
  raw_proxy?: string;
  note?: string | null;
}

export interface GpmCreateGroupInput {
  name: string;
  sort_order?: number;
}

export interface GpmUpdateGroupInput {
  name: string;
  sort_order?: number;
}

export interface GpmStartProfileOptions {
  remote_debugging_port?: number;
  window_scale?: number;
  window_pos?: string;
  window_size?: string;
  skip_proxy_check?: boolean;
  addition_args?: string;
}

type GpmFetchOptions = {
  method?: 'GET' | 'POST';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
};

function buildUrl(path: string, query?: GpmFetchOptions['query']): string {
  const base = env.gpmApiBaseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${base}${normalizedPath}`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === '' || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

async function gpmFetch<T>(path: string, options: GpmFetchOptions = {}): Promise<GpmEnvelope<T>> {
  const url = buildUrl(path, options.query);

  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const payload = (await response.json()) as GpmEnvelope<T>;

    if (!response.ok || !payload.success) {
      throw new AppError(payload.message || `GPM request failed (${response.status})`, 502, 'GPM_API_ERROR');
    }

    return payload;
  } catch (err) {
    if (err instanceof AppError) throw err;
    const detail = err instanceof Error ? err.message : 'Unknown error';
    throw new AppError(`Cannot reach GPM Local API: ${detail}`, 503, 'GPM_UNAVAILABLE');
  }
}

export async function pingGpm(): Promise<GpmConnectionStatus> {
  try {
    const response = await gpmFetch<GpmPaginated<GpmProfile>>('/profiles', {
      query: { page: 1, page_size: 1 },
    });

    return {
      connected: true,
      sender: response.sender,
      baseUrl: env.gpmApiBaseUrl,
      message: response.message,
    };
  } catch (err) {
    const message = err instanceof AppError ? err.message : 'GPM unavailable';
    return {
      connected: false,
      baseUrl: env.gpmApiBaseUrl,
      message,
    };
  }
}

export async function listGpmProfiles(query: GpmListQuery = {}) {
  const response = await gpmFetch<GpmPaginated<GpmProfile>>('/profiles', {
    query: query as Record<string, string | number | boolean | undefined | null>,
  });
  return response.data;
}

export async function getGpmProfile(id: string) {
  const response = await gpmFetch<GpmProfile>(`/profiles/${id}`);
  return response.data;
}

export async function createGpmProfile(input: GpmCreateProfileInput) {
  const response = await gpmFetch<GpmProfile>('/profiles/create', {
    method: 'POST',
    body: input,
  });
  return response.data;
}

export async function updateGpmProfile(id: string, input: GpmUpdateProfileInput) {
  const response = await gpmFetch<GpmProfile>(`/profiles/update/${id}`, {
    method: 'POST',
    body: input,
  });
  return response.data;
}

export async function deleteGpmProfile(id: string, mode: 'soft' | 'hard' = 'soft') {
  await gpmFetch<null>(`/profiles/delete/${id}`, { query: { mode } });
}

export async function startGpmProfile(id: string, options: GpmStartProfileOptions = {}) {
  const response = await gpmFetch<GpmStartResult>(`/profiles/start/${id}`, {
    query: options as Record<string, string | number | boolean | undefined | null>,
  });
  return response.data;
}

export async function stopGpmProfile(id: string) {
  await gpmFetch<null>(`/profiles/stop/${id}`);
}

export async function listGpmGroups(query: GpmListQuery = {}) {
  const response = await gpmFetch<GpmPaginated<GpmGroup>>('/groups', {
    query: query as Record<string, string | number | boolean | undefined | null>,
  });
  return response.data;
}

export async function getGpmGroup(id: string) {
  const response = await gpmFetch<GpmGroup>(`/groups/${id}`);
  return response.data;
}

export async function createGpmGroup(input: GpmCreateGroupInput) {
  const response = await gpmFetch<GpmGroup>('/groups/create', {
    method: 'POST',
    body: input,
  });
  return response.data;
}

export async function updateGpmGroup(id: string, input: GpmUpdateGroupInput) {
  const response = await gpmFetch<GpmGroup>(`/groups/update/${id}`, {
    method: 'POST',
    body: input,
  });
  return response.data;
}

export async function deleteGpmGroup(id: string) {
  await gpmFetch<null>(`/groups/delete/${id}`);
}
