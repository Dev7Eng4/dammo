import fs from 'node:fs/promises';
import path from 'node:path';
import { paths } from '../../../../config/paths.js';
import { AppError } from '../../../../shared/http/errors.js';
import { SI_FPS, SI_OVERLAY_AUTO_SENTINEL, SI_SMALL_VIDEO_H, SI_SMALL_VIDEO_W } from './si.constants.js';

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

export async function selectRandomSiSmallVideoClip(): Promise<SiSmallVideoClip> {
  let entries: string[];
  try {
    entries = await fs.readdir(paths.siSmallVideoDir);
  } catch {
    throw new AppError('Small video assets directory not found', 500, 'SI_SMALL_VIDEO_EMPTY');
  }

  const clips = entries
    .filter(name => SMALL_VIDEO_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort();

  if (clips.length === 0) {
    throw new AppError('No small video assets found', 400, 'SI_SMALL_VIDEO_EMPTY');
  }

  const filename = clips[Math.floor(Math.random() * clips.length)]!;
  return {
    path: path.join(paths.siSmallVideoDir, filename),
    filename,
  };
}

export async function resolveSiSmallVideoClip(filename?: string): Promise<SiSmallVideoClip> {
  const selected = filename?.trim();
  if (!selected || selected === SI_OVERLAY_AUTO_SENTINEL) {
    return selectRandomSiSmallVideoClip();
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
