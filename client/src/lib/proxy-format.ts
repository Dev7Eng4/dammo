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

export function formatProxyOptionLabel(proxy: Proxy): string {
  const count = proxy.assignedProfileIds.length;
  const profileSuffix = count === 1 ? '1 profile' : `${count} profiles`;
  return `${formatProxyLabel(proxy)} · ${profileSuffix}`;
}
