import fs from 'node:fs';
import { paths, siLocalStockUsageFile } from '../../../../config/paths.js';
import { readJson, updateJson } from '../../../../infrastructure/storage/json-store.js';

export interface SiLocalStockUsageStore {
  clips: Record<string, { used: number }>;
}

const EMPTY_STORE: SiLocalStockUsageStore = { clips: {} };

export function readSiLocalStockUsage(): SiLocalStockUsageStore {
  return readJson<SiLocalStockUsageStore>(siLocalStockUsageFile()) ?? EMPTY_STORE;
}

export function getSiLocalClipUsedCount(filename: string): number {
  const store = readSiLocalStockUsage();
  return store.clips[filename]?.used ?? 0;
}

export function incrementSiLocalClipUsed(filename: string): number {
  return updateJson<SiLocalStockUsageStore>(
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

export function ensureSiLocalStockDirExists(): void {
  if (!fs.existsSync(paths.siLocalStockDir)) {
    fs.mkdirSync(paths.siLocalStockDir, { recursive: true });
  }
}
