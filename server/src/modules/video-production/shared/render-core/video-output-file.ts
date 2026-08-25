import fs from 'node:fs';
import path from 'node:path';
import {
  INTERMEDIATE_MP4_BASENAMES,
  INTERMEDIATE_MP4_PREFIXES,
  OUTPUT_VIDEO_BASENAME,
} from './output-artifacts.constants.js';

/** Max basename length (without .mp4) to stay within Windows path limits. */
const MAX_BASENAME_LENGTH = 140;

/** Sanitize a metadata title into a safe mp4 basename (no extension). */
export function sanitizeVideoOutputBasename(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return OUTPUT_VIDEO_BASENAME;

  let safe = trimmed
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '');

  if (!safe) return OUTPUT_VIDEO_BASENAME;

  if (safe.length > MAX_BASENAME_LENGTH) {
    safe = safe.slice(0, MAX_BASENAME_LENGTH).trim().replace(/[.\s-]+$/g, '');
  }

  return safe || OUTPUT_VIDEO_BASENAME;
}

function isIntermediateMp4Basename(basenameWithoutExt: string): boolean {
  const lower = basenameWithoutExt.toLowerCase();
  if (INTERMEDIATE_MP4_BASENAMES.has(basenameWithoutExt) || INTERMEDIATE_MP4_BASENAMES.has(lower)) {
    return true;
  }
  return INTERMEDIATE_MP4_PREFIXES.some(prefix => lower.startsWith(prefix));
}

/**
 * Find the final uploadable .mp4 in the root of a video folder.
 * Excludes known intermediate artifacts. Prefer a single eligible file;
 * if multiple remain, prefer the largest by size.
 */
export function findFinalVideoMp4(folderPath: string): string | null {
  let entries: string[];
  try {
    entries = fs.readdirSync(folderPath);
  } catch {
    return null;
  }

  const candidates: { name: string; size: number }[] = [];

  for (const name of entries) {
    if (!name.toLowerCase().endsWith('.mp4')) continue;
    const basename = path.basename(name, path.extname(name));
    if (isIntermediateMp4Basename(basename)) continue;

    const fullPath = path.join(folderPath, name);
    try {
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) continue;
      candidates.push({ name, size: stat.size });
    } catch {
      continue;
    }
  }

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return path.join(folderPath, candidates[0].name);

  candidates.sort((a, b) => b.size - a.size);
  return path.join(folderPath, candidates[0].name);
}
