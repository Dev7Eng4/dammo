import { paths } from '../../config/paths.js';
import { readJson, updateJson } from '../../infrastructure/storage/json-store.js';
import type { ChromeProfile, ChromeProfileRole, ChromeProfilesStore } from './chrome-profiles.types.js';

const EMPTY_STORE: ChromeProfilesStore = { profiles: [] };

function normalizeRole(role: ChromeProfileRole | undefined): ChromeProfileRole {
  return role === 'main' ? 'main' : 'sub';
}

function normalizeUsageOrder(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) return undefined;
  return value;
}

function normalizeProfile(profile: ChromeProfile): ChromeProfile {
  const usageOrder = normalizeUsageOrder(profile.usageOrder);
  const normalized: ChromeProfile = {
    id: profile.id,
    name: profile.name,
    userDataDir: profile.userDataDir,
    createdAt: profile.createdAt,
    role: normalizeRole(profile.role),
  };
  if (usageOrder !== undefined) {
    normalized.usageOrder = usageOrder;
  }
  return normalized;
}

function sortProfiles(profiles: ChromeProfile[]): ChromeProfile[] {
  return [...profiles].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
}

function loadStore(): ChromeProfilesStore {
  const store = readJson<ChromeProfilesStore>(paths.chromeProfiles) ?? EMPTY_STORE;
  return {
    profiles: store.profiles.map(normalizeProfile),
  };
}

export class ChromeProfilesRepository {
  findAll(): ChromeProfile[] {
    return sortProfiles(loadStore().profiles);
  }

  findById(id: string): ChromeProfile | null {
    const profile = loadStore().profiles.find((item) => item.id === id);
    return profile ? normalizeProfile(profile) : null;
  }

  findByName(name: string): ChromeProfile | null {
    const normalized = name.trim().toLowerCase();
    return (
      loadStore().profiles.find((profile) => profile.name.trim().toLowerCase() === normalized) ??
      null
    );
  }

  findByRole(role: ChromeProfileRole): ChromeProfile[] {
    return sortProfiles(
      loadStore().profiles.filter((profile) => normalizeProfile(profile).role === role),
    );
  }

  saveStore(updater: (store: ChromeProfilesStore) => ChromeProfilesStore): ChromeProfilesStore {
    return updateJson(paths.chromeProfiles, updater, loadStore());
  }

  prepend(profile: ChromeProfile): ChromeProfile {
    this.saveStore((store) => ({
      profiles: [normalizeProfile(profile), ...store.profiles.map(normalizeProfile)],
    }));
    return profile;
  }

  append(profile: ChromeProfile): ChromeProfile {
    this.saveStore((store) => ({
      profiles: [...store.profiles.map(normalizeProfile), normalizeProfile(profile)],
    }));
    return profile;
  }

  removeByIds(ids: string[]): ChromeProfile[] {
    const idSet = new Set(ids);
    const removed: ChromeProfile[] = [];

    this.saveStore((store) => ({
      profiles: store.profiles.filter((profile) => {
        const normalized = normalizeProfile(profile);
        if (!idSet.has(normalized.id)) return true;
        removed.push(normalized);
        return false;
      }),
    }));

    return removed;
  }

  setProfileRole(id: string, role: ChromeProfileRole): ChromeProfile | null {
    let updated: ChromeProfile | null = null;

    this.saveStore((store) => ({
      profiles: store.profiles.map((profile) => {
        const normalized = normalizeProfile(profile);
        if (normalized.id !== id) return normalized;

        updated = { ...normalized, role };
        return updated;
      }),
    }));

    return updated;
  }

  updateName(id: string, name: string): ChromeProfile | null {
    let updated: ChromeProfile | null = null;

    this.saveStore((store) => ({
      profiles: store.profiles.map((profile) => {
        const normalized = normalizeProfile(profile);
        if (normalized.id !== id) return normalized;

        updated = { ...normalized, name };
        return updated;
      }),
    }));

    return updated;
  }

  setUsageOrder(id: string, usageOrder: number): ChromeProfile | null {
    let updated: ChromeProfile | null = null;

    this.saveStore((store) => ({
      profiles: store.profiles.map((profile) => {
        const normalized = normalizeProfile(profile);
        if (normalized.id !== id) return normalized;

        updated = { ...normalized, usageOrder };
        return updated;
      }),
    }));

    return updated;
  }
}

export const chromeProfilesRepository = new ChromeProfilesRepository();
