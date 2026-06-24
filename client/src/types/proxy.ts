export type ProxyType = 'http' | 'https' | 'socks5';

export type ProxyStatus = 'active' | 'failed' | 'slow' | 'expired' | 'in_use';

export interface Proxy {
  id: string;
  name: string;
  type: ProxyType;
  host: string;
  port: number;
  username?: string;
  password?: string;
  location?: string;
  countryCode?: string;
  provider?: string;
  tags?: string[];
  status: ProxyStatus;
  latencyMs?: number;
  lastCheckedAt?: string;
  assignedProfileIds: string[];
  maxProfiles: number;
  archivedAt?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProxyStats {
  total: number;
  active: number;
  failed: number;
  assigned: number;
  unassigned: number;
  avgLatencyMs: number;
}

export interface ProxiesResponse {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  items: Proxy[];
}

export interface CreateProxyPayload {
  name: string;
  type: ProxyType;
  host: string;
  port: number;
  username?: string;
  password?: string;
  location?: string;
  countryCode?: string;
  provider?: string;
  tags?: string[];
  expiresAt?: string;
}

export interface UpdateProxyPayload {
  name?: string;
  type?: ProxyType;
  host?: string;
  port?: number;
  username?: string | null;
  password?: string | null;
  location?: string | null;
  countryCode?: string | null;
  provider?: string | null;
  tags?: string[];
  status?: ProxyStatus;
}

export type ProxyFilter = 'all' | ProxyStatus;

export interface ProxyTestResult {
  status: ProxyStatus;
  latencyMs?: number;
  lastCheckedAt: string;
  error?: string;
}

export interface ProxyImportResult {
  created: number;
  skipped: number;
  errors: string[];
}

export interface ProxyFormValues {
  type: ProxyType;
  host: string;
  port: number;
  username?: string;
  password?: string;
  countryCode?: string;
  providerId?: string;
  expiresAt?: string;
}

export type ProxyTab = 'monitoring' | 'providers' | 'automations' | 'library';

export interface ProxyProvider {
  id: string;
  name: string;
  loginUrl?: string;
  username: string;
  password: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProxyProvidersResponse {
  items: ProxyProvider[];
}

export interface CreateProxyProviderPayload {
  name: string;
  loginUrl?: string;
  username: string;
  password: string;
  notes?: string;
}

export interface UpdateProxyProviderPayload {
  name?: string;
  loginUrl?: string;
  username?: string;
  password?: string;
  notes?: string | null;
}

export interface ProxyProviderFormValues {
  name: string;
  loginUrl: string;
  username: string;
  password: string;
  notes?: string;
}
