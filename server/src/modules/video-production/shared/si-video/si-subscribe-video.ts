import fs from 'node:fs/promises';
import path from 'node:path';
import { paths } from '../../../../config/paths.js';
import { AppError } from '../../../../shared/http/errors.js';
import type { SiSmallVideoClip } from './si-small-video.js';
import { getPreparedColorAssetPath, prepareColorAsset } from './si-prepare-color-cache.js';
import { SI_OVERLAY_AUTO_SENTINEL } from './si.constants.js';

const SUBSCRIBE_VIDEO_EXTENSIONS = new Set(['.mp4', '.mov']);

export interface SiSubscribeClipResolved extends SiSmallVideoClip {
  /** True when using a pre-keyed cached file (no runtime colorkey needed). */
  preKeyed: boolean;
}

async function resolvePreparedSubscribe(filename: string): Promise<SiSubscribeClipResolved> {
  const prepared = await prepareColorAsset('subscribe', filename);
  return {
    path: prepared.preparedPath,
    filename,
    preKeyed: true,
  };
}

export async function selectRandomSiSubscribeClip(): Promise<SiSubscribeClipResolved> {
  let entries: string[];
  try {
    entries = await fs.readdir(paths.siSubscribeDir);
  } catch {
    throw new AppError('Subscribe assets directory not found', 500, 'SI_SUBSCRIBE_EMPTY');
  }

  const clips = entries
    .filter(name => SUBSCRIBE_VIDEO_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort();

  if (clips.length === 0) {
    throw new AppError('No subscribe assets found', 400, 'SI_SUBSCRIBE_EMPTY');
  }

  const filename = clips[Math.floor(Math.random() * clips.length)]!;
  return resolvePreparedSubscribe(filename);
}

export async function resolveSiSubscribeClip(filename?: string): Promise<SiSubscribeClipResolved> {
  const selected = filename?.trim();
  if (!selected || selected === SI_OVERLAY_AUTO_SENTINEL) {
    return selectRandomSiSubscribeClip();
  }

  const safeName = path.basename(selected);
  if (!SUBSCRIBE_VIDEO_EXTENSIONS.has(path.extname(safeName).toLowerCase())) {
    throw new AppError(`Unsupported subscribe file type: ${safeName}`, 400, 'INVALID_SUBSCRIBE_VIDEO');
  }

  const filePath = path.join(paths.siSubscribeDir, safeName);
  try {
    await fs.access(filePath);
  } catch {
    throw new AppError(`Subscribe asset not found: ${safeName}`, 400, 'SI_SUBSCRIBE_MISSING');
  }

  const cached = await getPreparedColorAssetPath('subscribe', safeName);
  if (cached.prepared) {
    return { path: cached.path, filename: safeName, preKeyed: true };
  }
  return resolvePreparedSubscribe(safeName);
}
