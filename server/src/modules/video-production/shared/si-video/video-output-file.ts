import fs from 'node:fs';
import path from 'node:path';
import { AI_SLIDESHOW_RAW_BASENAME } from '../ai-video/ai-video.constants.js';
import { SI_MULTI_IMAGE_SLIDESHOW_BASENAME, SI_OUTPUT_VIDEO_BASENAME } from './si.constants.js';

/** Max basename length (without .mp4) to stay within Windows path limits. */
const MAX_BASENAME_LENGTH = 140;

/**
 * Intermediate / artifact mp4 basenames (no extension) that must not be treated
 * as the final uploadable video when scanning a video folder.
 */
const INTERMEDIATE_MP4_BASENAMES = new Set([
  AI_SLIDESHOW_RAW_BASENAME,
  SI_MULTI_IMAGE_SLIDESHOW_BASENAME,
  'stock_processed',
  'stock_local_cycle',
  'stock_raw',
]);

const INTERMEDIATE_MP4_PREFIXES = ['stock_', 'clip_', 'slideshow_'] as const;

/** Sanitize a metadata title into a safe mp4 basename (no extension). */
export function sanitizeVideoOutputBasename(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return SI_OUTPUT_VIDEO_BASENAME;

  let safe = trimmed
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '');

  if (!safe) return SI_OUTPUT_VIDEO_BASENAME;

  if (safe.length > MAX_BASENAME_LENGTH) {
    safe = safe.slice(0, MAX_BASENAME_LENGTH).trim().replace(/[.\s-]+$/g, '');
  }

  return safe || SI_OUTPUT_VIDEO_BASENAME;
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
