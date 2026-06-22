import { paths } from '../../config/paths.js';
import { readJson, updateJson, writeJson } from '../../infrastructure/storage/json-store.js';
import { ensureUuid, isUuid } from '../../shared/id.js';
import type { ProxyProvider, ProxyProvidersStore } from './proxy-providers.types.js';

const EMPTY_STORE: ProxyProvidersStore = { providers: [] };

type LegacyStore = ProxyProvidersStore & { nextId?: number };

function normalizeStore(raw: LegacyStore | null): ProxyProvidersStore {
  if (!raw?.providers) return EMPTY_STORE;

  const needsMigration = raw.nextId !== undefined || raw.providers.some((item) => !isUuid(item.id));
  if (!needsMigration) return { providers: raw.providers };

  return {
    providers: raw.providers.map((item) => ({
      ...item,
      id: ensureUuid(item.id),
    })),
  };
}

function loadStore(): ProxyProvidersStore {
  const raw = readJson<LegacyStore>(paths.proxyProviders);
  if (!raw) {
    writeJson(paths.proxyProviders, EMPTY_STORE);
    return EMPTY_STORE;
  }

  const normalized = normalizeStore(raw);
  const needsPersist =
    raw.nextId !== undefined ||
    raw.providers.some((item, i) => item.id !== normalized.providers[i]?.id);

  if (needsPersist) {
    writeJson(paths.proxyProviders, normalized);
  }

  return normalized;
}

export class ProxyProvidersRepository {
  findAll(): ProxyProvider[] {
    return loadStore().providers;
  }

  findById(id: string): ProxyProvider | null {
    return loadStore().providers.find((item) => item.id === id) ?? null;
  }

  saveStore(updater: (store: ProxyProvidersStore) => ProxyProvidersStore): ProxyProvidersStore {
    return updateJson(paths.proxyProviders, updater, loadStore());
  }

  prepend(provider: ProxyProvider): ProxyProvider {
    this.saveStore((store) => ({
      providers: [provider, ...store.providers],
    }));
    return provider;
  }

  update(id: string, updater: (provider: ProxyProvider) => ProxyProvider): ProxyProvider | null {
    let updated: ProxyProvider | null = null;
    this.saveStore((store) => ({
      providers: store.providers.map((item) => {
        if (item.id !== id) return item;
        updated = updater(item);
        return updated;
      }),
    }));
    return updated;
  }

  remove(id: string): boolean {
    let removed = false;
    this.saveStore((store) => ({
      providers: store.providers.filter((item) => {
        if (item.id !== id) return true;
        removed = true;
        return false;
      }),
    }));
    return removed;
  }
}

export const proxyProvidersRepository = new ProxyProvidersRepository();
