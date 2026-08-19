import { paths } from '../../config/paths.js';
import { readJson, updateJson, writeJson } from '../../infrastructure/storage/json-store.js';
import type { SmallVideoGroup, SmallVideoGroupsStore } from './small-video-groups.types.js';

const EMPTY_STORE: SmallVideoGroupsStore = { groups: [] };

function loadStore(): SmallVideoGroupsStore {
  const raw = readJson<SmallVideoGroupsStore>(paths.smallVideoGroups);
  if (!raw?.groups) {
    writeJson(paths.smallVideoGroups, EMPTY_STORE);
    return EMPTY_STORE;
  }
  return { groups: raw.groups };
}

export class SmallVideoGroupsRepository {
  findAll(): SmallVideoGroup[] {
    return loadStore().groups;
  }

  findById(id: string): SmallVideoGroup | null {
    return loadStore().groups.find((item) => item.id === id) ?? null;
  }

  saveStore(updater: (store: SmallVideoGroupsStore) => SmallVideoGroupsStore): SmallVideoGroupsStore {
    return updateJson(paths.smallVideoGroups, updater, loadStore());
  }

  prepend(group: SmallVideoGroup): SmallVideoGroup {
    this.saveStore((store) => ({
      groups: [group, ...store.groups],
    }));
    return group;
  }

  update(id: string, updater: (group: SmallVideoGroup) => SmallVideoGroup): SmallVideoGroup | null {
    let updated: SmallVideoGroup | null = null;
    this.saveStore((store) => ({
      groups: store.groups.map((item) => {
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
      groups: store.groups.filter((item) => {
        if (item.id !== id) return true;
        removed = true;
        return false;
      }),
    }));
    return removed;
  }
}

export const smallVideoGroupsRepository = new SmallVideoGroupsRepository();
