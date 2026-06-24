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

export interface ProxiesStore {
  proxies: Proxy[];
}

export interface CreateProxyInput {
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

export interface UpdateProxyInput {
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

export interface ProxyStats {
  total: number;
  active: number;
  failed: number;
  assigned: number;
  unassigned: number;
  avgLatencyMs: number;
}

export interface ProxyTestResult {
  status: ProxyStatus;
  latencyMs?: number;
  lastCheckedAt: string;
  error?: string;
}
