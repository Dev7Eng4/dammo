import { env } from '../../config/env.js';
import { AppError } from '../../shared/http/errors.js';

export interface GpmEnvelope<T> {
  success: boolean;
  data: T;
  message: string;
  sender?: string;
  pagination?: GpmV3Pagination;
}

interface GpmV3Pagination {
  total: number;
  page: number;
  page_size: number;
  total_page: number;
}

interface GpmV3Profile {
  id: string;
  name: string;
  raw_proxy?: string;
  browser_type?: string;
  browser_version?: string;
  group_id?: string | number;
  profile_path?: string;
  note?: string;
  created_at?: string;
  updated_at?: string;
}

interface GpmV3Group {
  id: number | string;
  name: string;
  sort?: number;
  created_by?: number;
  created_at?: string;
  updated_at?: string;
}

interface GpmV3StartResult {
  success?: boolean;
  profile_id: string;
  browser_location?: string;
  remote_debugging_address?: string;
  driver_path?: string;
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
  /** Dammo-local overlay — not sent to GPM Login API */
  flowEnabled?: boolean;
  /** Dammo-local overlay — not sent to GPM Login API */
  metaEnabled?: boolean;
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
  browser_location?: string;
  remote_debugging_address?: string;
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
  group_id?: string;
}

export interface GpmCreateProfileInput {
  name: string;
  group_id?: string | null;
  group_name?: string | null;
  raw_proxy?: string;
  note?: string | null;
}

const DEFAULT_CREATE_PROFILE_BODY = {
  browser_core: 'chromium',
  browser_name: 'Chrome',
  is_random_browser_version: false,
  startup_urls: '',
  is_masked_font: true,
  is_noise_canvas: true,
  is_noise_webgl: true,
  is_noise_client_rect: true,
  is_noise_audio_context: true,
  is_random_screen: false,
  is_masked_webgl_data: true,
  is_masked_media_device: true,
  is_random_os: false,
  os: 'Windows 11',
  webrtc_mode: 2,
  user_agent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
} as const;

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
  win_scale?: number;
  win_pos?: string;
  win_size?: string;
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

async function gpmFetchRaw<T>(path: string, options: GpmFetchOptions = {}): Promise<GpmEnvelope<T>> {
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

function normalizeProfile(raw: GpmV3Profile): GpmProfile {
  const browserType = raw.browser_type?.trim();
  const browserVersion = raw.browser_version?.trim();

  return {
    id: String(raw.id),
    name: raw.name,
    group_id: raw.group_id != null ? String(raw.group_id) : '',
    storage_path: raw.profile_path,
    raw_proxy: raw.raw_proxy,
    browser:
      browserType || browserVersion
        ? {
            name: browserType ?? '',
            version: browserVersion ?? '',
          }
        : undefined,
    note: raw.note,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

function normalizeGroup(raw: GpmV3Group): GpmGroup {
  return {
    id: String(raw.id),
    name: raw.name,
    sort_order: raw.sort,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    creator: raw.created_by != null ? String(raw.created_by) : null,
  };
}

function parseRemoteDebuggingPort(address?: string): number | undefined {
  if (!address?.trim()) return undefined;
  const match = address.trim().match(/:(\d+)\s*$/);
  if (!match) return undefined;
  const port = Number(match[1]);
  return Number.isFinite(port) ? port : undefined;
}

function normalizeStartResult(raw: GpmV3StartResult): GpmStartResult {
  const address = raw.remote_debugging_address?.trim();
  const port = parseRemoteDebuggingPort(address);

  return {
    profile_id: String(raw.profile_id),
    driver_path: raw.driver_path,
    browser_location: raw.browser_location,
    remote_debugging_address: address,
    remote_debugging_port: port,
  };
}

function normalizeProfilesListResponse(
  data: GpmV3Profile[] | GpmPaginated<GpmProfile> | undefined,
  pagination?: GpmV3Pagination,
): GpmPaginated<GpmProfile> {
  const items = Array.isArray(data) ? data.map(normalizeProfile) : (data?.data ?? []);

  if (pagination) {
    return {
      data: items,
      current_page: pagination.page,
      per_page: pagination.page_size,
      total: pagination.total,
      last_page: pagination.total_page,
    };
  }

  if (!Array.isArray(data) && data && 'data' in data) {
    return data as GpmPaginated<GpmProfile>;
  }

  return {
    data: items,
    current_page: 1,
    per_page: items.length,
    total: items.length,
    last_page: 1,
  };
}

function toListQuery(query: GpmListQuery = {}): Record<string, string | number | boolean | undefined | null> {
  return {
    page: query.page,
    per_page: query.page_size,
    search: query.search,
    sort: query.sort,
    group_id: query.group_id,
  };
}

function deleteModeToV3(mode: 'soft' | 'hard'): 1 | 2 {
  return mode === 'hard' ? 2 : 1;
}

function startOptionsToV3(options: GpmStartProfileOptions = {}): Record<string, string | number | undefined> {
  return {
    win_scale: options.win_scale,
    win_pos: options.win_pos,
    win_size: options.win_size,
    addination_args: options.addition_args,
  };
}

async function resolveGroupName(groupId: string | null | undefined): Promise<string | undefined> {
  if (!groupId?.trim()) return undefined;

  const groups = await listGpmGroups();
  const match = groups.data.find(group => group.id === String(groupId));
  return match?.name;
}

export async function pingGpm(): Promise<GpmConnectionStatus> {
  try {
    const response = await gpmFetchRaw<GpmV3Profile[]>('/profiles', {
      query: { page: 1, per_page: 1 },
    });

    return {
      connected: true,
      sender: response.sender ?? 'GPM-Login API v3',
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

export async function listGpmProfiles(query: GpmListQuery = {}): Promise<GpmPaginated<GpmProfile>> {
  const response = await gpmFetchRaw<GpmV3Profile[]>('/profiles', {
    query: toListQuery(query),
  });

  return normalizeProfilesListResponse(response.data, response.pagination);
}

export async function getGpmProfile(id: string): Promise<GpmProfile> {
  const response = await gpmFetchRaw<GpmV3Profile>(`/profiles/${id}`);
  return normalizeProfile(response.data);
}

export async function createGpmProfile(input: GpmCreateProfileInput): Promise<GpmProfile> {
  const groupName =
    input.group_name?.trim() ||
    (input.group_id ? await resolveGroupName(input.group_id) : undefined);

  const body: Record<string, unknown> = {
    ...DEFAULT_CREATE_PROFILE_BODY,
    profile_name: input.name,
    raw_proxy: input.raw_proxy ?? '',
  };

  if (groupName) body.group_name = groupName;
  if (input.note != null) body.note = input.note;

  const response = await gpmFetchRaw<GpmV3Profile>('/profiles/create', {
    method: 'POST',
    body,
  });

  return normalizeProfile(response.data);
}

export async function updateGpmProfile(id: string, input: GpmUpdateProfileInput): Promise<GpmProfile> {
  const body: Record<string, unknown> = {};

  if (input.name !== undefined) body.profile_name = input.name;
  if (input.raw_proxy !== undefined) body.raw_proxy = input.raw_proxy.trim();
  if (input.note?.trim()) body.note = input.note.trim();
  if (input.group_id !== undefined && input.group_id !== null && input.group_id !== '') {
    body.group_id = Number(input.group_id);
  }

  const response = await gpmFetchRaw<GpmV3Profile | Record<string, never>>(`/profiles/update/${id}`, {
    method: 'POST',
    body,
  });

  if (response.data && typeof response.data === 'object' && 'id' in response.data) {
    return normalizeProfile(response.data as GpmV3Profile);
  }

  return getGpmProfile(id);
}

export async function deleteGpmProfile(id: string, mode: 'soft' | 'hard' = 'soft'): Promise<void> {
  await gpmFetchRaw<null>(`/profiles/delete/${id}`, { query: { mode: deleteModeToV3(mode) } });
}

export async function startGpmProfile(id: string, options: GpmStartProfileOptions = {}): Promise<GpmStartResult> {
  const response = await gpmFetchRaw<GpmV3StartResult>(`/profiles/start/${id}`, {
    query: startOptionsToV3(options),
  });

  return normalizeStartResult(response.data);
}

export async function stopGpmProfile(id: string): Promise<void> {
  await gpmFetchRaw<null>(`/profiles/close/${id}`);
}

export async function listGpmGroups(_query: GpmListQuery = {}): Promise<GpmPaginated<GpmGroup>> {
  const response = await gpmFetchRaw<GpmV3Group[]>('/groups');
  const groups = (response.data ?? []).map(normalizeGroup);

  return {
    data: groups,
    current_page: 1,
    per_page: groups.length,
    total: groups.length,
    last_page: 1,
  };
}

export async function getGpmGroup(id: string): Promise<GpmGroup> {
  const groups = await listGpmGroups();
  const match = groups.data.find(group => group.id === String(id));
  if (!match) {
    throw new AppError(`GPM group not found: ${id}`, 404, 'NOT_FOUND');
  }
  return match;
}

export async function createGpmGroup(input: GpmCreateGroupInput): Promise<GpmGroup> {
  const body: Record<string, unknown> = {
    group_name: input.name,
  };

  const response = await gpmFetchRaw<GpmV3Group>('/groups/create', {
    method: 'POST',
    body,
  });

  return normalizeGroup(response.data);
}

export async function updateGpmGroup(_id: string, _input: GpmUpdateGroupInput): Promise<GpmGroup> {
  throw new AppError('GPM API v3 does not support updating groups', 501, 'GPM_NOT_SUPPORTED');
}

export async function deleteGpmGroup(_id: string): Promise<void> {
  throw new AppError('GPM API v3 does not support deleting groups', 501, 'GPM_NOT_SUPPORTED');
}
