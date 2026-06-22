import { paths } from '../../config/paths.js';
import { readJson, updateJson, writeJson } from '../../infrastructure/storage/json-store.js';
import { ensureUuid, isUuid } from '../../shared/id.js';
import type { SourceChannel, SourceChannelsStore } from './source-channels.types.js';

const EMPTY_STORE: SourceChannelsStore = { sources: [] };

function isCurrentSchema(source: Partial<SourceChannel>): source is SourceChannel {
  return (
    typeof source.platform === 'string' &&
    typeof source.fullUrl === 'string' &&
    typeof source.purpose === 'string' &&
    typeof source.riskLevel === 'string' &&
    Array.isArray(source.mappedOwnedChannels) &&
    Array.isArray(source.activeProjects)
  );
}

function needsLegacyMigration(raw: SourceChannelsStore): boolean {
  return raw.sources.some((s) => !isUuid(s.id)) || !raw.sources.every(isCurrentSchema);
}

function migrateStore(raw: SourceChannelsStore): SourceChannelsStore {
  const sources = raw.sources.map((source) => ({
    ...source,
    id: ensureUuid(source.id),
  }));
  const store = { sources };
  writeJson(paths.sourceChannels, store);
  return store;
}

function loadStore(): SourceChannelsStore {
  const raw = readJson<SourceChannelsStore>(paths.sourceChannels);
  if (!raw || !Array.isArray(raw.sources)) return EMPTY_STORE;
  if (needsLegacyMigration(raw)) return migrateStore(raw);
  return raw;
}

export class SourceChannelsRepository {
  findAll(): SourceChannel[] {
    return loadStore().sources;
  }

  findById(id: string): SourceChannel | null {
    return loadStore().sources.find((s) => s.id === id) ?? null;
  }

  prepend(source: SourceChannel): SourceChannel {
    updateJson(
      paths.sourceChannels,
      (store) => ({
        sources: [source, ...store.sources],
      }),
      loadStore(),
    );
    return source;
  }

  update(id: string, updater: (source: SourceChannel) => SourceChannel): SourceChannel | null {
    let updated: SourceChannel | null = null;

    updateJson(
      paths.sourceChannels,
      (store) => {
        const index = store.sources.findIndex((s) => s.id === id);
        if (index === -1) return store;

        updated = updater(store.sources[index]);
        const sources = [...store.sources];
        sources[index] = updated;
        return { sources };
      },
      loadStore(),
    );

    return updated;
  }

  remove(id: string): boolean {
    let removed = false;

    updateJson(
      paths.sourceChannels,
      (store) => {
        const index = store.sources.findIndex((s) => s.id === id);
        if (index === -1) return store;

        removed = true;
        const sources = [...store.sources];
        sources.splice(index, 1);
        return { sources };
      },
      loadStore(),
    );

    return removed;
  }
}

export const sourceChannelsRepository = new SourceChannelsRepository();
