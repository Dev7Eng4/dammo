import { paths } from '../../config/paths.js';
import { readJson, updateJson, writeJson } from '../../infrastructure/storage/json-store.js';

export interface GpmProfileCapabilities {
  flowEnabled: boolean;
  metaEnabled: boolean;
}

export interface GpmProfileCapabilitiesStore {
  byProfileId: Record<string, GpmProfileCapabilities>;
}

export type GpmProfileCapabilitiesPatch = Partial<GpmProfileCapabilities>;

const DEFAULT_CAPABILITIES: GpmProfileCapabilities = {
  flowEnabled: false,
  metaEnabled: false,
};

const EMPTY_STORE: GpmProfileCapabilitiesStore = { byProfileId: {} };

function normalizeCapabilities(value?: Partial<GpmProfileCapabilities> | null): GpmProfileCapabilities {
  return {
    flowEnabled: value?.flowEnabled === true,
    metaEnabled: value?.metaEnabled === true,
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

  set(profileId: string, patch: GpmProfileCapabilitiesPatch): GpmProfileCapabilities {
    let next = DEFAULT_CAPABILITIES;
    updateJson(paths.gpmProfileCapabilities, (store) => {
      const current = normalizeCapabilities(store.byProfileId[profileId]);
      next = {
        flowEnabled: patch.flowEnabled !== undefined ? patch.flowEnabled : current.flowEnabled,
        metaEnabled: patch.metaEnabled !== undefined ? patch.metaEnabled : current.metaEnabled,
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

  remove(profileId: string): void {
    updateJson(paths.gpmProfileCapabilities, (store) => {
      if (!(profileId in store.byProfileId)) return store;
      const { [profileId]: _removed, ...rest } = store.byProfileId;
      return { byProfileId: rest };
    }, loadStore());
  }
}

export const gpmProfileCapabilitiesRepository = new GpmProfileCapabilitiesRepository();
