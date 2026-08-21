import type { Proxy } from '../types/proxy';

export function buildRawProxy(proxy: Proxy): string {
  if (proxy.rawProxy) return proxy.rawProxy;
  const hostPort = `${proxy.host}:${proxy.port}`;
  if (proxy.username) {
    return `${hostPort}:${proxy.username}:${proxy.password ?? ''}`;
  }
  return hostPort;
}

export function formatProxyLabel(proxy: Proxy): string {
  const hostPort = `${proxy.host}:${proxy.port}`;
  const suffix = proxy.countryCode ? ` · ${proxy.countryCode.toUpperCase()}` : '';
  return `${hostPort}${suffix}`;
}

function formatProxyLastUsed(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('vi-VN');
}

/** Select label: `host:port (n) / date` — n = assigned profiles, date = last used */
export function formatProxyOptionLabel(proxy: Proxy): string {
  const count = proxy.assignedProfileIds.length;
  const lastUsed = formatProxyLastUsed(proxy.lastUsed);
  return `${formatProxyLabel(proxy)} (${count}) / ${lastUsed}`;
}
