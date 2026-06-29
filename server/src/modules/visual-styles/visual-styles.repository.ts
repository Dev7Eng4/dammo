import { paths } from '../../config/paths.js';
import { readJson, updateJson, writeJson } from '../../infrastructure/storage/json-store.js';
import { ensureUuid, isUuid } from '../../shared/id.js';
import type { VisualStyle, VisualStylesStore } from './visual-styles.types.js';

const EMPTY_STORE: VisualStylesStore = { styles: [] };

type LegacyStore = VisualStylesStore & { nextId?: number };

function normalizeStore(raw: LegacyStore | null): VisualStylesStore {
  if (!raw?.styles) return EMPTY_STORE;

  const needsMigration = raw.nextId !== undefined || raw.styles.some((item) => !isUuid(item.id));
  if (!needsMigration) return { styles: raw.styles };

  return {
    styles: raw.styles.map((item) => ({
      ...item,
      id: ensureUuid(item.id),
    })),
  };
}

function loadStore(): VisualStylesStore {
  const raw = readJson<LegacyStore>(paths.visualStyles);
  if (!raw) {
    writeJson(paths.visualStyles, EMPTY_STORE);
    return EMPTY_STORE;
  }

  const normalized = normalizeStore(raw);
  const needsPersist =
    raw.nextId !== undefined || raw.styles.some((item, i) => item.id !== normalized.styles[i]?.id);

  if (needsPersist) {
    writeJson(paths.visualStyles, normalized);
  }

  return normalized;
}

export class VisualStylesRepository {
  findAll(): VisualStyle[] {
    return loadStore().styles;
  }

  findById(id: string): VisualStyle | null {
    return loadStore().styles.find((item) => item.id === id) ?? null;
  }

  saveStore(updater: (store: VisualStylesStore) => VisualStylesStore): VisualStylesStore {
    return updateJson(paths.visualStyles, updater, loadStore());
  }

  prepend(style: VisualStyle): VisualStyle {
    this.saveStore((store) => ({
      styles: [style, ...store.styles],
    }));
    return style;
  }

  update(id: string, updater: (style: VisualStyle) => VisualStyle): VisualStyle | null {
    let updated: VisualStyle | null = null;
    this.saveStore((store) => ({
      styles: store.styles.map((item) => {
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
      styles: store.styles.filter((item) => {
        if (item.id !== id) return true;
        removed = true;
        return false;
      }),
    }));
    return removed;
  }
}

export const visualStylesRepository = new VisualStylesRepository();
