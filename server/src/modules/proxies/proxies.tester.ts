import { ProxyAgent, fetch as undiciFetch } from 'undici';
import type { Proxy, ProxyStatus, ProxyTestResult } from './proxies.types.js';

const TEST_URL = 'https://api.ipify.org?format=json';
const TEST_TIMEOUT_MS = 10_000;
const SLOW_THRESHOLD_MS = 500;

function buildProxyUrl(proxy: Proxy): string {
  const auth =
    proxy.username != null && proxy.username !== ''
      ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password ?? '')}@`
      : '';
  const scheme = proxy.type === 'socks5' ? 'socks5' : 'http';
  return `${scheme}://${auth}${proxy.host}:${proxy.port}`;
}

function resolveStatus(latencyMs: number): ProxyStatus {
  return latencyMs >= SLOW_THRESHOLD_MS ? 'slow' : 'active';
}

export async function testProxyConnection(proxy: Proxy): Promise<ProxyTestResult> {
  const lastCheckedAt = new Date().toISOString();
  const agent = new ProxyAgent(buildProxyUrl(proxy));
  const start = Date.now();

  try {
    const response = await undiciFetch(TEST_URL, {
      dispatcher: agent,
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      return {
        status: 'failed',
        lastCheckedAt,
        error: `HTTP ${response.status}`,
      };
    }

    const latencyMs = Date.now() - start;
    return {
      status: resolveStatus(latencyMs),
      latencyMs,
      lastCheckedAt,
    };
  } catch (err) {
    return {
      status: 'failed',
      lastCheckedAt,
      error: err instanceof Error ? err.message : 'Connection failed',
    };
  } finally {
    await agent.close();
  }
}
