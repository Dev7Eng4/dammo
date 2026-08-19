import fs from 'node:fs/promises';
import path from 'node:path';
import { paths, smallVideoGroupDir } from '../../../../config/paths.js';
import { AppError } from '../../../../shared/http/errors.js';
import { isUuid } from '../../../../shared/id.js';
import {
  parseSmallVideoGroupId,
  SI_FPS,
  SI_OVERLAY_AUTO_SENTINEL,
  SI_SMALL_VIDEO_H,
  SI_SMALL_VIDEO_W,
} from './si.constants.js';

const SMALL_VIDEO_EXTENSIONS = new Set(['.mp4', '.mov']);

export interface SiSmallVideoClip {
  path: string;
  filename: string;
}

/** Scale to fill SI_SMALL_VIDEO box then center-crop so the PiP box is exact. */
export function appendSiSmallVideoScaleFilters(
  filterParts: string[],
  inputLabel: string,
  outputLabel = 'small_video_scaled',
): void {
  filterParts.push(
    `[${inputLabel}]fps=${SI_FPS},scale=${SI_SMALL_VIDEO_W}:${SI_SMALL_VIDEO_H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${SI_SMALL_VIDEO_W}:${SI_SMALL_VIDEO_H}[${outputLabel}]`,
  );
}

async function listVideoClipsInDir(dir: string): Promise<string[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter(
      (entry) => entry.isFile() && SMALL_VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()),
    )
    .map((entry) => entry.name)
    .sort();
}

export async function selectRandomSiSmallVideoClip(): Promise<SiSmallVideoClip> {
  const clips = await listVideoClipsInDir(paths.siSmallVideoDir);

  if (clips.length === 0) {
    throw new AppError('No small video assets found', 400, 'SI_SMALL_VIDEO_EMPTY');
  }

  const filename = clips[Math.floor(Math.random() * clips.length)]!;
  return {
    path: path.join(paths.siSmallVideoDir, filename),
    filename,
  };
}

export async function selectRandomSiSmallVideoClipFromGroup(groupId: string): Promise<SiSmallVideoClip> {
  if (!isUuid(groupId)) {
    throw new AppError(`Invalid small video group id: ${groupId}`, 400, 'INVALID_SMALL_VIDEO_GROUP');
  }

  const dir = smallVideoGroupDir(groupId);
  try {
    await fs.access(dir);
  } catch {
    throw new AppError(`Small video group not found: ${groupId}`, 400, 'SI_SMALL_VIDEO_GROUP_MISSING');
  }

  const clips = await listVideoClipsInDir(dir);
  if (clips.length === 0) {
    throw new AppError('Selected small video group has no clips', 400, 'SI_SMALL_VIDEO_GROUP_EMPTY');
  }

  const filename = clips[Math.floor(Math.random() * clips.length)]!;
  return {
    path: path.join(dir, filename),
    filename,
  };
}

export async function resolveSiSmallVideoClip(filename?: string): Promise<SiSmallVideoClip> {
  const selected = filename?.trim();
  if (!selected || selected === SI_OVERLAY_AUTO_SENTINEL) {
    return selectRandomSiSmallVideoClip();
  }

  const groupId = parseSmallVideoGroupId(selected);
  if (groupId) {
    return selectRandomSiSmallVideoClipFromGroup(groupId);
  }

  const safeName = path.basename(selected);
  if (!SMALL_VIDEO_EXTENSIONS.has(path.extname(safeName).toLowerCase())) {
    throw new AppError(`Unsupported small video file type: ${safeName}`, 400, 'INVALID_SMALL_VIDEO');
  }

  const filePath = path.join(paths.siSmallVideoDir, safeName);
  try {
    await fs.access(filePath);
  } catch {
    throw new AppError(`Small video asset not found: ${safeName}`, 400, 'SI_SMALL_VIDEO_MISSING');
  }

  return { path: filePath, filename: safeName };
}
