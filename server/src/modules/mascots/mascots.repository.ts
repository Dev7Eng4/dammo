import { paths } from '../../config/paths.js';
import { readJson, updateJson, writeJson } from '../../infrastructure/storage/json-store.js';
import type { MascotsStore, Mascot } from './mascots.types.js';

const EMPTY_STORE: MascotsStore = { mascots: [] };

function loadStore(): MascotsStore {
  const raw = readJson<MascotsStore>(paths.mascots);
  if (!raw?.mascots) {
    writeJson(paths.mascots, EMPTY_STORE);
    return EMPTY_STORE;
  }
  return { mascots: raw.mascots };
}

export class MascotsRepository {
  findAll(): Mascot[] {
    return loadStore().mascots;
  }

  findById(id: string): Mascot | null {
    return loadStore().mascots.find((item) => item.id === id) ?? null;
  }

  saveStore(updater: (store: MascotsStore) => MascotsStore): MascotsStore {
    return updateJson(paths.mascots, updater, loadStore());
  }

  prepend(mascot: Mascot): Mascot {
    this.saveStore((store) => ({ mascots: [mascot, ...store.mascots] }));
    return mascot;
  }

  update(id: string, updater: (mascot: Mascot) => Mascot): Mascot | null {
    let updated: Mascot | null = null;
    this.saveStore((store) => ({
      mascots: store.mascots.map((item) => {
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
      mascots: store.mascots.filter((item) => {
        if (item.id !== id) return true;
        removed = true;
        return false;
      }),
    }));
    return removed;
  }
}

export const mascotsRepository = new MascotsRepository();
