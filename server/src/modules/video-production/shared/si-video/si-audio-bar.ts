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
} from './si.constants.js';

const AUDIO_BAR_EXTENSIONS = new Set(['.mp4', '.mov']);

export interface SiAudioBarClip {
  path: string;
  filename: string;
}

/** Scale and chroma-key black background, keeping original bar colors. */
export function appendSiAudioBarScaleFilters(
  filterParts: string[],
  inputLabel: string,
  outputLabel = 'audio_bar_scaled',
): void {
  filterParts.push(
    `[${inputLabel}]fps=${SI_FPS},scale=${SI_AUDIO_BAR_WIDTH_PX}:-1,format=rgba,colorkey=${SI_AUDIO_BAR_COLORKEY}:${SI_AUDIO_BAR_COLORKEY_SIMILARITY}:${SI_AUDIO_BAR_COLORKEY_BLEND}[${outputLabel}]`,
  );
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
  return {
    path: path.join(paths.siAudioBarDir, filename),
    filename,
  };
}
