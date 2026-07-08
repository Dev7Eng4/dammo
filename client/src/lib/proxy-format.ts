import type { Proxy } from '../types/proxy';

export function buildRawProxy(proxy: Proxy): string {
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
