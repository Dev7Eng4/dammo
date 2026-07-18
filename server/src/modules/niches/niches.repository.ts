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
}

export const nichesRepository = new NichesRepository();
