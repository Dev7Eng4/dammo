import { paths } from '../../config/paths.js';
import { readJson, updateJson, writeJson } from '../../infrastructure/storage/json-store.js';
import type { Niche, NichesStore } from './niches.types.js';

const EMPTY_STORE: NichesStore = { niches: [] };

function loadStore(): NichesStore {
  const raw = readJson<NichesStore>(paths.niches);
  if (!raw?.niches) {
    writeJson(paths.niches, EMPTY_STORE);
    return EMPTY_STORE;
  }
  return { niches: raw.niches };
}

export class NichesRepository {
  findAll(): Niche[] {
    return loadStore().niches;
  }

  findByKey(key: string): Niche | null {
    return loadStore().niches.find((item) => item.key === key) ?? null;
  }

  saveStore(updater: (store: NichesStore) => NichesStore): NichesStore {
    return updateJson(paths.niches, updater, loadStore());
  }

  prepend(niche: Niche): Niche {
    this.saveStore((store) => ({
      niches: [niche, ...store.niches],
    }));
    return niche;
  }

  update(key: string, updater: (niche: Niche) => Niche): Niche | null {
    let updated: Niche | null = null;
    this.saveStore((store) => ({
      niches: store.niches.map((item) => {
        if (item.key !== key) return item;
        updated = updater(item);
        return updated;
      }),
    }));
    return updated;
  }

  remove(key: string): boolean {
    let removed = false;
    this.saveStore((store) => ({
      niches: store.niches.filter((item) => {
        if (item.key !== key) return true;
        removed = true;
        return false;
      }),
    }));
    return removed;
  }
}

export const nichesRepository = new NichesRepository();
