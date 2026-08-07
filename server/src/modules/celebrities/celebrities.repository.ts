import { paths } from '../../config/paths.js';
import { readJson, updateJson, writeJson } from '../../infrastructure/storage/json-store.js';
import type { CelebritiesStore, Celebrity } from './celebrities.types.js';

const EMPTY_STORE: CelebritiesStore = { celebrities: [] };

function loadStore(): CelebritiesStore {
  const raw = readJson<CelebritiesStore>(paths.celebrities);
  if (!raw?.celebrities) {
    writeJson(paths.celebrities, EMPTY_STORE);
    return EMPTY_STORE;
  }
  return { celebrities: raw.celebrities };
}

export class CelebritiesRepository {
  findAll(): Celebrity[] {
    return loadStore().celebrities;
  }

  findById(id: string): Celebrity | null {
    return loadStore().celebrities.find((item) => item.id === id) ?? null;
  }

  saveStore(updater: (store: CelebritiesStore) => CelebritiesStore): CelebritiesStore {
    return updateJson(paths.celebrities, updater, loadStore());
  }

  prepend(celebrity: Celebrity): Celebrity {
    this.saveStore((store) => ({
      celebrities: [celebrity, ...store.celebrities],
    }));
    return celebrity;
  }

  update(id: string, updater: (celebrity: Celebrity) => Celebrity): Celebrity | null {
    let updated: Celebrity | null = null;
    this.saveStore((store) => ({
      celebrities: store.celebrities.map((item) => {
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
      celebrities: store.celebrities.filter((item) => {
        if (item.id !== id) return true;
        removed = true;
        return false;
      }),
    }));
    return removed;
  }
}

export const celebritiesRepository = new CelebritiesRepository();
