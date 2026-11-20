import { paths } from '../../config/paths.js';
import { readJson, updateJson } from '../../infrastructure/storage/json-store.js';
import {
  LLM_CONTENT_OPTIONS,
  LLM_IMAGE_OPTIONS,
  LLM_VIDEO_OPTIONS,
  type ChromeProfile,
  type ChromeProfilesStore,
  type UpdateChromeProfileLlmsInput,
} from './chrome-profiles.types.js';

const EMPTY_STORE: ChromeProfilesStore = { profiles: [] };

function normalizeUsageOrder(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) return undefined;
  return value;
}

/** Keeps known options only, deduped, in option order. Accepts a legacy single string. */
function pickOptions<T extends string>(options: readonly T[], value: unknown): T[] | undefined {
  const raw: unknown[] = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const picked = options.filter((option) => raw.includes(option));
  return picked.length > 0 ? picked : undefined;
}

function normalizeProfile(profile: ChromeProfile): ChromeProfile {
  const usageOrder = normalizeUsageOrder(profile.usageOrder);
  const normalized: ChromeProfile = {
    id: profile.id,
    name: profile.name,
    userDataDir: profile.userDataDir,
    createdAt: profile.createdAt,
  };
  if (usageOrder !== undefined) {
    normalized.usageOrder = usageOrder;
  }
  const llmContent = pickOptions(LLM_CONTENT_OPTIONS, profile.llmContent);
  if (llmContent) normalized.llmContent = llmContent;
  const llmImage = pickOptions(LLM_IMAGE_OPTIONS, profile.llmImage);
  if (llmImage) normalized.llmImage = llmImage;
  const llmVideo = pickOptions(LLM_VIDEO_OPTIONS, profile.llmVideo);
  if (llmVideo) normalized.llmVideo = llmVideo;
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

  saveStore(updater: (store: ChromeProfilesStore) => ChromeProfilesStore): ChromeProfilesStore {
    return updateJson(paths.chromeProfiles, updater, loadStore());
  }

  prepend(profile: ChromeProfile): ChromeProfile {
    this.saveStore((store) => ({
      profiles: [normalizeProfile(profile), ...store.profiles.map(normalizeProfile)],
    }));
    return profile;
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

  updateLlms(id: string, input: UpdateChromeProfileLlmsInput): ChromeProfile | null {
    let updated: ChromeProfile | null = null;

    this.saveStore((store) => ({
      profiles: store.profiles.map((profile) => {
        const normalized = normalizeProfile(profile);
        if (normalized.id !== id) return normalized;

        // normalizeProfile drops empty lists and unknown values.
        updated = normalizeProfile({ ...normalized, ...input } as ChromeProfile);
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
