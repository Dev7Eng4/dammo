import { paths } from '../../config/paths.js';
import { readJson, updateJson, writeJson } from '../../infrastructure/storage/json-store.js';
import { ensureUuid, isUuid } from '../../shared/id.js';
import type { ProxiesStore, Proxy } from './proxies.types.js';

const EMPTY_STORE: ProxiesStore = { proxies: [] };

type LegacyProxiesStore = ProxiesStore & { nextId?: number };

function normalizeStore(raw: LegacyProxiesStore | null): ProxiesStore {
  if (!raw?.proxies) return EMPTY_STORE;

  const needsMigration = raw.nextId !== undefined || raw.proxies.some((proxy) => !isUuid(proxy.id));

  return {
    proxies: raw.proxies.map((proxy) => ({
      ...proxy,
      id: needsMigration ? ensureUuid(proxy.id) : proxy.id,
      assignedProfileIds: proxy.assignedProfileIds ?? [],
      lastUsed: proxy.lastUsed || undefined,
    })),
  };
}

function loadStore(): ProxiesStore {
  const raw = readJson<LegacyProxiesStore>(paths.proxies);
  if (!raw) {
    writeJson(paths.proxies, EMPTY_STORE);
    return EMPTY_STORE;
  }

  const normalized = normalizeStore(raw);
  const needsPersist =
    raw.nextId !== undefined ||
    raw.proxies.some((proxy, i) => proxy.id !== normalized.proxies[i]?.id);

  if (needsPersist) {
    writeJson(paths.proxies, normalized);
  }

  return normalized;
}

export class ProxiesRepository {
  findAll(): Proxy[] {
    return loadStore().proxies;
  }

  findById(id: string): Proxy | null {
    return loadStore().proxies.find((proxy) => proxy.id === id) ?? null;
  }

  saveStore(updater: (store: ProxiesStore) => ProxiesStore): ProxiesStore {
    return updateJson(paths.proxies, updater, loadStore());
  }

  prepend(proxy: Proxy): Proxy {
    this.saveStore((store) => ({
      proxies: [proxy, ...store.proxies],
    }));
    return proxy;
  }

  update(id: string, updater: (proxy: Proxy) => Proxy): Proxy | null {
    let updated: Proxy | null = null;
    this.saveStore((store) => ({
      proxies: store.proxies.map((proxy) => {
        if (proxy.id !== id) return proxy;
        updated = updater(proxy);
        return updated;
      }),
    }));
    return updated;
  }

  archiveMany(ids: string[]): number {
    let count = 0;
    const now = new Date().toISOString();
    this.saveStore((store) => ({
      proxies: store.proxies.map((proxy) => {
        if (!ids.includes(proxy.id) || proxy.archivedAt) return proxy;
        count += 1;
        return { ...proxy, archivedAt: now, updatedAt: now };
      }),
    }));
    return count;
  }
}

export const proxiesRepository = new ProxiesRepository();
