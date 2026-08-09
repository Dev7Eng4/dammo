import fs from 'node:fs';
import { paths, siLocalStockUsageFile } from '../../../../config/paths.js';
import { readJson, updateJson } from '../../../../infrastructure/storage/json-store.js';

export interface LocalStockUsageStore {
  clips: Record<string, { used: number }>;
}

const EMPTY_STORE: LocalStockUsageStore = { clips: {} };

export function readLocalStockUsage(): LocalStockUsageStore {
  return readJson<LocalStockUsageStore>(siLocalStockUsageFile()) ?? EMPTY_STORE;
}

export function getLocalClipUsedCount(filename: string): number {
  const store = readLocalStockUsage();
  return store.clips[filename]?.used ?? 0;
}

export function incrementLocalClipUsed(filename: string): number {
  return updateJson<LocalStockUsageStore>(
    siLocalStockUsageFile(),
    current => {
      const clips = { ...current.clips };
      const prev = clips[filename]?.used ?? 0;
      clips[filename] = { used: prev + 1 };
      return { clips };
    },
    EMPTY_STORE,
  ).clips[filename]!.used;
}

export function ensureLocalStockDirExists(): void {
  if (!fs.existsSync(paths.siLocalStockDir)) {
    fs.mkdirSync(paths.siLocalStockDir, { recursive: true });
  }
}
