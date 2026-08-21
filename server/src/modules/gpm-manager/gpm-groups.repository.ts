import { paths } from '../../config/paths.js';
import { readJson, updateJson, writeJson } from '../../infrastructure/storage/json-store.js';
import type { GpmGroup } from '../../infrastructure/gpm/gpm-api.client.js';
import { generateId } from '../../shared/id.js';
import { AppError } from '../../shared/http/errors.js';

export interface GpmGroupsStore {
  groups: GpmGroup[];
}

const EMPTY_STORE: GpmGroupsStore = { groups: [] };

function normalizeGroup(raw: Partial<GpmGroup> & { id?: string; name?: string }): GpmGroup | null {
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!id || !name) return null;

  return {
    id,
    name,
    sort_order: typeof raw.sort_order === 'number' && Number.isFinite(raw.sort_order) ? raw.sort_order : 0,
    created_at: typeof raw.created_at === 'string' ? raw.created_at : undefined,
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : undefined,
    creator: raw.creator ?? null,
  };
}

function loadStore(): GpmGroupsStore {
  const raw = readJson<GpmGroupsStore>(paths.gpmGroups);
  if (!raw?.groups || !Array.isArray(raw.groups)) {
    writeJson(paths.gpmGroups, EMPTY_STORE);
    return EMPTY_STORE;
  }

  const groups = raw.groups
    .map((item) => normalizeGroup(item))
    .filter((item): item is GpmGroup => item != null);

  return { groups };
}

function sortGroups(groups: GpmGroup[]): GpmGroup[] {
  return [...groups].sort((a, b) => {
    const sortDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (sortDiff !== 0) return sortDiff;
    return a.name.localeCompare(b.name, 'vi');
  });
}

export class GpmGroupsRepository {
  findAll(): GpmGroup[] {
    return sortGroups(loadStore().groups);
  }

  findById(id: string): GpmGroup | null {
    return loadStore().groups.find((group) => group.id === id) ?? null;
  }

  create(input: { name: string; sort_order?: number }): GpmGroup {
    const name = input.name.trim();
    if (!name) {
      throw new AppError('Group name is required', 400, 'INVALID_INPUT');
    }

    const now = new Date().toISOString();
    const group: GpmGroup = {
      id: generateId(),
      name,
      sort_order: input.sort_order ?? 0,
      created_at: now,
      updated_at: now,
      creator: null,
    };

    updateJson(
      paths.gpmGroups,
      (store) => ({
        groups: [group, ...store.groups],
      }),
      loadStore(),
    );

    return group;
  }

  update(id: string, input: { name: string; sort_order?: number }): GpmGroup {
    const name = input.name.trim();
    if (!name) {
      throw new AppError('Group name is required', 400, 'INVALID_INPUT');
    }

    let updated: GpmGroup | null = null;
    updateJson(
      paths.gpmGroups,
      (store) => ({
        groups: store.groups.map((group) => {
          if (group.id !== id) return group;
          updated = {
            ...group,
            name,
            sort_order: input.sort_order !== undefined ? input.sort_order : (group.sort_order ?? 0),
            updated_at: new Date().toISOString(),
          };
          return updated;
        }),
      }),
      loadStore(),
    );

    if (!updated) {
      throw new AppError(`GPM group not found: ${id}`, 404, 'NOT_FOUND');
    }

    return updated;
  }

  remove(id: string): void {
    let removed = false;
    updateJson(
      paths.gpmGroups,
      (store) => {
        const next = store.groups.filter((group) => {
          if (group.id !== id) return true;
          removed = true;
          return false;
        });
        return { groups: next };
      },
      loadStore(),
    );

    if (!removed) {
      throw new AppError(`GPM group not found: ${id}`, 404, 'NOT_FOUND');
    }
  }
}

export const gpmGroupsRepository = new GpmGroupsRepository();
