import fs from 'node:fs/promises';
import path from 'node:path';
import { paths } from '../../../../config/paths.js';
import { AppError } from '../../../../shared/http/errors.js';
import {
  SI_AUDIO_BAR_COLORKEY,
  SI_AUDIO_BAR_COLORKEY_BLEND,
  SI_AUDIO_BAR_COLORKEY_SIMILARITY,
  SI_AUDIO_BAR_WIDTH_PX,
  SI_FPS,
  SI_OVERLAY_AUTO_SENTINEL,
} from './si.constants.js';
import { getPreparedColorAssetPath, prepareColorAsset } from './si-prepare-color-cache.js';

const AUDIO_BAR_EXTENSIONS = new Set(['.mp4', '.mov']);

export interface SiAudioBarClip {
  path: string;
  filename: string;
  /** True when using a pre-keyed cached file (no runtime colorkey needed). */
  preKeyed: boolean;
}

/** Scale audio bar; optionally chroma-key green background when not pre-keyed. */
export function appendSiAudioBarScaleFilters(
  filterParts: string[],
  inputLabel: string,
  outputLabel = 'audio_bar_scaled',
  options?: { preKeyed?: boolean },
): void {
  if (options?.preKeyed) {
    // Cache is already sized + keyed — keep alpha for overlay.
    filterParts.push(`[${inputLabel}]format=rgba[${outputLabel}]`);
    return;
  }
  const scale = `fps=${SI_FPS},scale=${SI_AUDIO_BAR_WIDTH_PX}:-1`;
  filterParts.push(
    `[${inputLabel}]${scale},format=rgba,colorkey=${SI_AUDIO_BAR_COLORKEY}:${SI_AUDIO_BAR_COLORKEY_SIMILARITY}:${SI_AUDIO_BAR_COLORKEY_BLEND}[${outputLabel}]`,
  );
}

async function resolvePreparedAudioBar(filename: string): Promise<SiAudioBarClip> {
  const prepared = await prepareColorAsset('audioBar', filename);
  return {
    path: prepared.preparedPath,
    filename,
    preKeyed: true,
  };
}

export async function selectRandomSiAudioBarClip(): Promise<SiAudioBarClip> {
  let entries: string[];
  try {
    entries = await fs.readdir(paths.siAudioBarDir);
  } catch {
    throw new AppError('Audio bar assets directory not found', 500, 'SI_AUDIO_BAR_EMPTY');
  }

  const clips = entries
    .filter(name => AUDIO_BAR_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort();

  if (clips.length === 0) {
    throw new AppError('No audio bar video assets found', 400, 'SI_AUDIO_BAR_EMPTY');
  }

  const filename = clips[Math.floor(Math.random() * clips.length)]!;
  return resolvePreparedAudioBar(filename);
}

export async function resolveSiAudioBarClip(filename?: string): Promise<SiAudioBarClip> {
  const selected = filename?.trim();
  if (!selected || selected === SI_OVERLAY_AUTO_SENTINEL) {
    return selectRandomSiAudioBarClip();
  }

  const safeName = path.basename(selected);
  if (!AUDIO_BAR_EXTENSIONS.has(path.extname(safeName).toLowerCase())) {
    throw new AppError(`Unsupported audio bar file type: ${safeName}`, 400, 'INVALID_AUDIO_BAR');
  }

  const filePath = path.join(paths.siAudioBarDir, safeName);
  try {
    await fs.access(filePath);
  } catch {
    throw new AppError(`Audio bar asset not found: ${safeName}`, 400, 'SI_AUDIO_BAR_MISSING');
  }

  // Fast path when already prepared
  const cached = await getPreparedColorAssetPath('audioBar', safeName);
  if (cached.prepared) {
    return { path: cached.path, filename: safeName, preKeyed: true };
  }
  return resolvePreparedAudioBar(safeName);
}
