import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { paths } from '../../../../config/paths.js';
import { runFfmpeg } from '../../../../infrastructure/ffmpeg/ffmpeg-runner.js';
import { AppError } from '../../../../shared/http/errors.js';
import {
  SI_AUDIO_BAR_COLORKEY,
  SI_AUDIO_BAR_COLORKEY_BLEND,
  SI_AUDIO_BAR_COLORKEY_SIMILARITY,
  SI_AUDIO_BAR_WIDTH_PX,
  SI_FPS,
  SI_SMALL_VIDEO_H,
  SI_SMALL_VIDEO_W,
  SI_SUBSCRIBE_COLORKEY,
  SI_SUBSCRIBE_COLORKEY_BLEND,
  SI_SUBSCRIBE_COLORKEY_SIMILARITY,
} from './si.constants.js';

export type PrepareColorKind = 'audioBar' | 'subscribe';

interface PrepareParams {
  colorkey: string;
  similarity: number;
  blend: number;
}

function resolveKindDir(kind: PrepareColorKind): string {
  return kind === 'audioBar' ? paths.siAudioBarDir : paths.siSubscribeDir;
}

function resolveKindParams(kind: PrepareColorKind): PrepareParams {
  if (kind === 'audioBar') {
    return {
      colorkey: SI_AUDIO_BAR_COLORKEY,
      similarity: SI_AUDIO_BAR_COLORKEY_SIMILARITY,
      blend: SI_AUDIO_BAR_COLORKEY_BLEND,
    };
  }
  return {
    colorkey: SI_SUBSCRIBE_COLORKEY,
    similarity: SI_SUBSCRIBE_COLORKEY_SIMILARITY,
    blend: SI_SUBSCRIBE_COLORKEY_BLEND,
  };
}

function ensureSafeAssetName(name: string): string {
  const base = path.basename(name).trim();
  if (!base || base === '.' || base === '..' || base.includes('/') || base.includes('\\')) {
    throw new AppError('Invalid asset filename', 400, 'INVALID_FILE_NAME');
  }
  return base;
}

async function buildCacheKey(kind: PrepareColorKind, sourcePath: string): Promise<string> {
  const stat = await fs.stat(sourcePath);
  const params = resolveKindParams(kind);
  const raw = [
    kind,
    path.basename(sourcePath).toLowerCase(),
    stat.size,
    stat.mtimeMs,
    params.colorkey,
    params.similarity,
    params.blend,
    SI_FPS,
    kind === 'audioBar' ? SI_AUDIO_BAR_WIDTH_PX : `${SI_SMALL_VIDEO_W}x${SI_SMALL_VIDEO_H}`,
    'sized-v1',
  ].join('|');
  return crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16);
}

function cacheDirFor(kind: PrepareColorKind): string {
  return path.join(resolveKindDir(kind), '.cache');
}

async function resolvePreparedOutputPath(kind: PrepareColorKind, sourcePath: string): Promise<string> {
  const cacheKey = await buildCacheKey(kind, sourcePath);
  const stem = path.basename(sourcePath, path.extname(sourcePath));
  return path.join(cacheDirFor(kind), `${stem}.${cacheKey}.alpha.mov`);
}

function lockFilePath(outputPath: string): string {
  return `${outputPath}.lock`;
}

async function acquireLock(lockPath: string, retries = 150): Promise<() => Promise<void>> {
  for (let i = 0; i < retries; i += 1) {
    try {
      const handle = await fs.open(lockPath, 'wx');
      await handle.close();
      return async () => {
        await fs.unlink(lockPath).catch(() => undefined);
      };
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  throw new AppError('Prepare color is busy for this asset', 409, 'PREPARE_COLOR_BUSY');
}

async function sourcePathFor(kind: PrepareColorKind, filename: string): Promise<string> {
  const safe = ensureSafeAssetName(filename);
  const sourcePath = path.join(resolveKindDir(kind), safe);
  try {
    const stat = await fs.stat(sourcePath);
    if (!stat.isFile()) throw new Error('Not a file');
  } catch {
    throw new AppError(`Asset not found: ${safe}`, 404, 'NOT_FOUND');
  }
  return sourcePath;
}

async function preprocessToAlphaMov(kind: PrepareColorKind, inputPath: string, outputPath: string): Promise<void> {
  const params = resolveKindParams(kind);
  // Bake at final overlay size so merge can skip scale + colorkey.
  const sized =
    kind === 'audioBar'
      ? `fps=${SI_FPS},scale=${SI_AUDIO_BAR_WIDTH_PX}:-1`
      : `fps=${SI_FPS},scale=${SI_SMALL_VIDEO_W}:${SI_SMALL_VIDEO_H}:force_original_aspect_ratio=increase,crop=${SI_SMALL_VIDEO_W}:${SI_SMALL_VIDEO_H}`;
  const vf = `${sized},format=rgba,colorkey=${params.colorkey}:${params.similarity}:${params.blend}`;
  const tempPath = `${outputPath}.tmp.mov`;
  await runFfmpeg(
    ['-y', '-i', inputPath, '-vf', vf, '-an', '-c:v', 'qtrle', '-pix_fmt', 'argb', tempPath],
    { label: `prepare-color-${kind}`, encodeOpts: { preset: 'fast' } },
  );
  await fs.rename(tempPath, outputPath);
}

export async function getPreparedColorAssetPath(
  kind: PrepareColorKind,
  filename: string,
): Promise<{ path: string; prepared: boolean }> {
  const sourcePath = await sourcePathFor(kind, filename);
  const outputPath = await resolvePreparedOutputPath(kind, sourcePath);
  try {
    const stat = await fs.stat(outputPath);
    if (stat.isFile()) return { path: outputPath, prepared: true };
  } catch {
    // no cached file
  }
  return { path: sourcePath, prepared: false };
}

export async function prepareColorAsset(
  kind: PrepareColorKind,
  filename: string,
): Promise<{ preparedPath: string; cached: boolean }> {
  const sourcePath = await sourcePathFor(kind, filename);
  const outputPath = await resolvePreparedOutputPath(kind, sourcePath);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  try {
    const stat = await fs.stat(outputPath);
    if (stat.isFile()) {
      return { preparedPath: outputPath, cached: true };
    }
  } catch {
    // no cached file
  }

  const unlock = await acquireLock(lockFilePath(outputPath));
  try {
    try {
      const stat = await fs.stat(outputPath);
      if (stat.isFile()) {
        return { preparedPath: outputPath, cached: true };
      }
    } catch {
      // still not exist, continue
    }
    await preprocessToAlphaMov(kind, sourcePath, outputPath);
    return { preparedPath: outputPath, cached: false };
  } finally {
    await unlock();
  }
}
