import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../../../config/env.js';

interface CacheEntry {
  path: string;
  size: number;
  mtimeMs: number;
}

export interface PruneSlideshowCacheOptions {
  keepPaths?: readonly string[];
  onLog?: (message: string) => void;
}

/**
 * Retain reusable slide clips while bounding stale disk usage. Clips used by the
 * current render are never removed, even when they exceed the configured cap.
 */
export async function pruneSlideshowCache(
  cacheDir: string,
  options: PruneSlideshowCacheOptions = {},
): Promise<void> {
  const keep = new Set((options.keepPaths ?? []).map(filePath => path.resolve(filePath).toLowerCase()));
  let names: string[];
  try {
    names = await fs.readdir(cacheDir);
  } catch {
    return;
  }

  const entries: CacheEntry[] = [];
  for (const name of names) {
    if (!name.endsWith('.mp4')) continue;
    const filePath = path.join(cacheDir, name);
    try {
      const stat = await fs.stat(filePath);
      if (stat.isFile()) entries.push({ path: filePath, size: stat.size, mtimeMs: stat.mtimeMs });
    } catch {
      // A concurrent cleanup may already have removed the entry.
    }
  }

  const maxAgeMs = Math.max(0, env.slideshowCacheMaxAgeDays) * 24 * 60 * 60 * 1000;
  const maxBytes = Math.max(0, env.slideshowCacheMaxGiB) * 1024 ** 3;
  const now = Date.now();
  let removedFiles = 0;
  let removedBytes = 0;

  const removeEntry = async (entry: CacheEntry): Promise<boolean> => {
    if (keep.has(path.resolve(entry.path).toLowerCase())) return false;
    try {
      await fs.unlink(entry.path);
      removedFiles += 1;
      removedBytes += entry.size;
      return true;
    } catch {
      return false;
    }
  };

  const retained: CacheEntry[] = [];
  for (const entry of entries) {
    if (maxAgeMs > 0 && now - entry.mtimeMs > maxAgeMs && await removeEntry(entry)) continue;
    retained.push(entry);
  }

  let retainedBytes = retained.reduce((sum, entry) => sum + entry.size, 0);
  if (maxBytes > 0 && retainedBytes > maxBytes) {
    for (const entry of [...retained].sort((a, b) => a.mtimeMs - b.mtimeMs)) {
      if (retainedBytes <= maxBytes) break;
      if (await removeEntry(entry)) retainedBytes -= entry.size;
    }
  }

  options.onLog?.(
    `[slideshow] cache retained | files=${entries.length - removedFiles} | ` +
      `size=${(Math.max(0, entries.reduce((sum, entry) => sum + entry.size, 0) - removedBytes) / 1024 ** 2).toFixed(1)}MiB` +
      (removedFiles > 0 ? ` | pruned=${removedFiles}` : ''),
  );
}
