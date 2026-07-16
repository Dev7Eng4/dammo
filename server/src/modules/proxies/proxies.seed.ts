import { paths } from '../../config/paths.js';
import { readJson, writeJson } from '../../infrastructure/storage/json-store.js';
import { generateId } from '../../shared/id.js';
import type { ProxiesStore, Proxy } from './proxies.types.js';

const SAMPLE_PROXIES: Omit<Proxy, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'US-East-DC-01',
    type: 'https',
    host: '192.168.1.105',
    port: 8080,
    username: 'user_dc1',
    password: 'secret123',
    rawProxy: '192.168.1.105:8080:user_dc1:secret123',
    location: 'US, Ashburn',
    countryCode: 'US',
    provider: 'Luminati Network',
    tags: ['datacenter', 'fast'],
    status: 'active',
    latencyMs: 24,
    lastCheckedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    assignedProfileIds: [],
    maxProfiles: 0,
  },
  {
    name: 'DE-Frankfurt-04',
    type: 'socks5',
    host: '10.0.0.44',
    port: 1080,
    username: 'de_user',
    password: 'pass456',
    rawProxy: '10.0.0.44:1080:de_user:pass456',
    location: 'DE, Frankfurt',
    countryCode: 'DE',
    provider: 'ProxyMesh',
    tags: ['residential'],
    status: 'active',
    latencyMs: 38,
    lastCheckedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    assignedProfileIds: [],
    maxProfiles: 0,
  },
  {
    name: 'SG-Singapore-02',
    type: 'http',
    host: '203.0.113.10',
    port: 3128,
    rawProxy: '203.0.113.10:3128',
    location: 'SG, Singapore',
    countryCode: 'SG',
    provider: 'Bright Data',
    tags: ['asia'],
    status: 'slow',
    latencyMs: 620,
    lastCheckedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    assignedProfileIds: [],
    maxProfiles: 0,
  },
  {
    name: 'UK-London-07',
    type: 'https',
    host: '198.51.100.22',
    port: 8443,
    username: 'uk_proxy',
    password: 'ukpass',
    rawProxy: '198.51.100.22:8443:uk_proxy:ukpass',
    location: 'UK, London',
    countryCode: 'GB',
    provider: 'Oxylabs',
    tags: ['datacenter'],
    status: 'failed',
    assignedProfileIds: [],
    maxProfiles: 0,
  },
];

export function seedProxiesIfEmpty(): void {
  const existing = readJson<ProxiesStore>(paths.proxies);
  if (existing?.proxies?.length) return;

  const now = new Date().toISOString();
  const store: ProxiesStore = {
    proxies: SAMPLE_PROXIES.map((proxy) => ({
      ...proxy,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    })),
  };

  writeJson(paths.proxies, store);
}
