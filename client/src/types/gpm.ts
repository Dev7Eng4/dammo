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
  browser_type?: string;
  browser_version?: string;
  os?: string;
  note?: string;
  created_at?: string;
  updated_at?: string;
  tags?: string[];
}

export interface GpmGroup {
  id: string;
  name: string;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
  creator?: string | null;
}

export interface GpmPaginated<T> {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
  data: T[];
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

export interface GpmListParams {
  page?: number;
  page_size?: number;
  search?: string;
  sort?: number;
}

export interface CreateGpmProfilePayload {
  name: string;
  group_id?: string | null;
  raw_proxy?: string;
  note?: string | null;
}

export interface UpdateGpmProfilePayload {
  name?: string;
  group_id?: string | null;
  raw_proxy?: string;
  note?: string | null;
}

export interface CreateGpmGroupPayload {
  name: string;
  sort_order?: number;
}

export interface UpdateGpmGroupPayload {
  name: string;
  sort_order?: number;
}

export interface AddGpmProfileFormValues {
  name: string;
  group_id: string;
  proxyId: string;
  note: string;
}

export interface EditGpmProfileFormValues {
  name: string;
  group_id: string;
  proxyId: string;
  note: string;
}

export interface AddGpmGroupFormValues {
  name: string;
}

export interface EditGpmGroupFormValues {
  name: string;
  sort_order: string;
}

export type GpmProfileSort = 0 | 1 | 2 | 3;

export interface GpmTestResult {
  profileId: string;
  prompt: string;
  provider: 'gemini' | 'gpt' | 'flow';
  content: string;
  codeBlocks: string[];
  elapsedMs: number;
}
