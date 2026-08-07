import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { paths } from '../../../../config/paths.js';
import { runFfmpeg } from '../../../../infrastructure/ffmpeg/ffmpeg-runner.js';
import { AppError } from '../../../../shared/http/errors.js';
import {
  SI_AUDIO_BAR_WIDTH_PX,
  SI_FPS,
  SI_PREPARE_COLORKEY_BLACK,
  SI_PREPARE_COLORKEY_BLACK_BLEND,
  SI_PREPARE_COLORKEY_BLACK_SIMILARITY,
  SI_PREPARE_COLORKEY_GREEN,
  SI_PREPARE_COLORKEY_GREEN_BLEND,
  SI_PREPARE_COLORKEY_GREEN_SIMILARITY,
  SI_SMALL_VIDEO_H,
  SI_SMALL_VIDEO_W,
  type SiPrepareKeyColor,
} from './si.constants.js';

export type PrepareColorKind = 'audioBar' | 'subscribe';
export type { SiPrepareKeyColor };

const PREPARE_KEY_COLORS: SiPrepareKeyColor[] = ['green', 'black'];

interface PrepareParams {
  colorkey: string;
  similarity: number;
  blend: number;
}

function resolveKindDir(kind: PrepareColorKind): string {
  return kind === 'audioBar' ? paths.siAudioBarDir : paths.siSubscribeDir;
}

function resolveKindParams(_kind: PrepareColorKind, keyColor: SiPrepareKeyColor = 'green'): PrepareParams {
  if (keyColor === 'black') {
    return {
      colorkey: SI_PREPARE_COLORKEY_BLACK,
      similarity: SI_PREPARE_COLORKEY_BLACK_SIMILARITY,
      blend: SI_PREPARE_COLORKEY_BLACK_BLEND,
    };
  }
  return {
    colorkey: SI_PREPARE_COLORKEY_GREEN,
    similarity: SI_PREPARE_COLORKEY_GREEN_SIMILARITY,
    blend: SI_PREPARE_COLORKEY_GREEN_BLEND,
  };
}

function ensureSafeAssetName(name: string): string {
  const base = path.basename(name).trim();
  if (!base || base === '.' || base === '..' || base.includes('/') || base.includes('\\')) {
    throw new AppError('Invalid asset filename', 400, 'INVALID_FILE_NAME');
  }
  return base;
}

async function buildCacheKey(
  kind: PrepareColorKind,
  sourcePath: string,
  keyColor: SiPrepareKeyColor,
): Promise<string> {
  const stat = await fs.stat(sourcePath);
  const params = resolveKindParams(kind, keyColor);
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
    'sized-v2',
  ].join('|');
  return crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16);
}

function cacheDirFor(kind: PrepareColorKind): string {
  return path.join(resolveKindDir(kind), '.cache');
}

function keyColorSidecarPath(kind: PrepareColorKind, sourcePath: string): string {
  const stem = path.basename(sourcePath, path.extname(sourcePath));
  return path.join(cacheDirFor(kind), `${stem}.keycolor.json`);
}

async function writeKeyColorPreference(
  kind: PrepareColorKind,
  sourcePath: string,
  keyColor: SiPrepareKeyColor,
): Promise<void> {
  const sidecar = keyColorSidecarPath(kind, sourcePath);
  await fs.mkdir(path.dirname(sidecar), { recursive: true });
  await fs.writeFile(sidecar, JSON.stringify({ keyColor }), 'utf8');
}

export async function getPreferredPrepareKeyColor(
  kind: PrepareColorKind,
  filename: string,
): Promise<SiPrepareKeyColor> {
  const sourcePath = await sourcePathFor(kind, filename);
  const sidecar = keyColorSidecarPath(kind, sourcePath);
  try {
    const raw = await fs.readFile(sidecar, 'utf8');
    const parsed = JSON.parse(raw) as { keyColor?: unknown };
    if (parsed.keyColor === 'green' || parsed.keyColor === 'black') {
      return parsed.keyColor;
    }
  } catch {
    // no sidecar or invalid
  }
  return 'green';
}

async function resolvePreparedOutputPath(
  kind: PrepareColorKind,
  sourcePath: string,
  keyColor: SiPrepareKeyColor,
): Promise<string> {
  const cacheKey = await buildCacheKey(kind, sourcePath, keyColor);
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

async function preprocessToAlphaMov(
  kind: PrepareColorKind,
  inputPath: string,
  outputPath: string,
  keyColor: SiPrepareKeyColor,
): Promise<void> {
  const params = resolveKindParams(kind, keyColor);
  // Bake at final overlay size so merge can skip scale + colorkey.
  const sized =
    kind === 'audioBar'
      ? `fps=${SI_FPS},scale=${SI_AUDIO_BAR_WIDTH_PX}:-1:flags=lanczos`
      : `fps=${SI_FPS},scale=${SI_SMALL_VIDEO_W}:${SI_SMALL_VIDEO_H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${SI_SMALL_VIDEO_W}:${SI_SMALL_VIDEO_H}`;
  const vf = `${sized},format=rgba,colorkey=${params.colorkey}:${params.similarity}:${params.blend}`;
  const tempPath = `${outputPath}.tmp.mov`;
  await runFfmpeg(
    ['-y', '-i', inputPath, '-vf', vf, '-an', '-c:v', 'qtrle', '-pix_fmt', 'argb', tempPath],
    { label: `prepare-color-${kind}-${keyColor}`, encodeOpts: { preset: 'fast' } },
  );
  await fs.rename(tempPath, outputPath);
}

export async function getPreparedColorAssetPath(
  kind: PrepareColorKind,
  filename: string,
): Promise<{ path: string; prepared: boolean; keyColor?: SiPrepareKeyColor }> {
  const sourcePath = await sourcePathFor(kind, filename);
  let best: { path: string; keyColor: SiPrepareKeyColor; mtimeMs: number } | null = null;

  for (const keyColor of PREPARE_KEY_COLORS) {
    const outputPath = await resolvePreparedOutputPath(kind, sourcePath, keyColor);
    try {
      const stat = await fs.stat(outputPath);
      if (!stat.isFile()) continue;
      if (!best || stat.mtimeMs > best.mtimeMs) {
        best = { path: outputPath, keyColor, mtimeMs: stat.mtimeMs };
      }
    } catch {
      // try next color
    }
  }

  if (best) {
    return { path: best.path, prepared: true, keyColor: best.keyColor };
  }
  return { path: sourcePath, prepared: false };
}

export async function prepareColorAsset(
  kind: PrepareColorKind,
  filename: string,
  keyColor: SiPrepareKeyColor = 'green',
): Promise<{ preparedPath: string; cached: boolean; keyColor: SiPrepareKeyColor }> {
  const sourcePath = await sourcePathFor(kind, filename);
  const outputPath = await resolvePreparedOutputPath(kind, sourcePath, keyColor);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const finish = async (preparedPath: string, cached: boolean) => {
    await writeKeyColorPreference(kind, sourcePath, keyColor);
    return { preparedPath, cached, keyColor };
  };

  try {
    const stat = await fs.stat(outputPath);
    if (stat.isFile()) {
      return finish(outputPath, true);
    }
  } catch {
    // no cached file
  }

  const unlock = await acquireLock(lockFilePath(outputPath));
  try {
    try {
      const stat = await fs.stat(outputPath);
      if (stat.isFile()) {
        return finish(outputPath, true);
      }
    } catch {
      // still not exist, continue
    }
    await preprocessToAlphaMov(kind, sourcePath, outputPath, keyColor);
    return finish(outputPath, false);
  } finally {
    await unlock();
  }
}
