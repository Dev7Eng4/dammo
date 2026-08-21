import { paths } from '../../config/paths.js';
import { readJson, updateJson, writeJson } from '../../infrastructure/storage/json-store.js';

export interface GpmProfileCapabilities {
  flowEnabled: boolean;
  metaEnabled: boolean;
  /** Dammo-local group assignment — not sent to GPM Login API */
  groupId: string | null;
}

export interface GpmProfileCapabilitiesStore {
  byProfileId: Record<string, GpmProfileCapabilities>;
}

export type GpmProfileCapabilitiesPatch = Partial<GpmProfileCapabilities>;

const DEFAULT_CAPABILITIES: GpmProfileCapabilities = {
  flowEnabled: false,
  metaEnabled: false,
  groupId: null,
};

const EMPTY_STORE: GpmProfileCapabilitiesStore = { byProfileId: {} };

function normalizeGroupId(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeCapabilities(value?: Partial<GpmProfileCapabilities> | null): GpmProfileCapabilities {
  return {
    flowEnabled: value?.flowEnabled === true,
    metaEnabled: value?.metaEnabled === true,
    groupId: normalizeGroupId(value?.groupId),
  };
}

function loadStore(): GpmProfileCapabilitiesStore {
  const raw = readJson<GpmProfileCapabilitiesStore>(paths.gpmProfileCapabilities);
  if (!raw?.byProfileId || typeof raw.byProfileId !== 'object') {
    writeJson(paths.gpmProfileCapabilities, EMPTY_STORE);
    return EMPTY_STORE;
  }

  const byProfileId: Record<string, GpmProfileCapabilities> = {};
  for (const [profileId, caps] of Object.entries(raw.byProfileId)) {
    byProfileId[profileId] = normalizeCapabilities(caps);
  }
  return { byProfileId };
}

export class GpmProfileCapabilitiesRepository {
  get(profileId: string): GpmProfileCapabilities {
    return normalizeCapabilities(loadStore().byProfileId[profileId]);
  }

  getAll(): Record<string, GpmProfileCapabilities> {
    return loadStore().byProfileId;
  }

  set(profileId: string, patch: GpmProfileCapabilitiesPatch): GpmProfileCapabilities {
    let next = DEFAULT_CAPABILITIES;
    updateJson(paths.gpmProfileCapabilities, (store) => {
      const current = normalizeCapabilities(store.byProfileId[profileId]);
      next = {
        flowEnabled: patch.flowEnabled !== undefined ? patch.flowEnabled : current.flowEnabled,
        metaEnabled: patch.metaEnabled !== undefined ? patch.metaEnabled : current.metaEnabled,
        groupId: patch.groupId !== undefined ? normalizeGroupId(patch.groupId) : current.groupId,
      };
      return {
        byProfileId: {
          ...store.byProfileId,
          [profileId]: next,
        },
      };
    }, loadStore());
    return next;
  }

  clearGroupId(groupId: string): void {
    updateJson(paths.gpmProfileCapabilities, (store) => {
      let changed = false;
      const byProfileId: Record<string, GpmProfileCapabilities> = {};
      for (const [profileId, caps] of Object.entries(store.byProfileId)) {
        const normalized = normalizeCapabilities(caps);
        if (normalized.groupId === groupId) {
          changed = true;
          byProfileId[profileId] = { ...normalized, groupId: null };
        } else {
          byProfileId[profileId] = normalized;
        }
      }
      return changed ? { byProfileId } : store;
    }, loadStore());
  }

  remove(profileId: string): void {
    updateJson(paths.gpmProfileCapabilities, (store) => {
      if (!(profileId in store.byProfileId)) return store;
      const { [profileId]: _removed, ...rest } = store.byProfileId;
      return { byProfileId: rest };
    }, loadStore());
  }
}

export const gpmProfileCapabilitiesRepository = new GpmProfileCapabilitiesRepository();
