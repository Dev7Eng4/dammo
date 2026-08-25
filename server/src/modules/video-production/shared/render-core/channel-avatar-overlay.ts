import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { runFfmpeg } from '../../../../infrastructure/ffmpeg/ffmpeg-runner.js';
import {
  CHANNEL_AVATAR_MARGIN_RIGHT_PX,
  CHANNEL_AVATAR_MARGIN_TOP_PX,
  CHANNEL_AVATAR_SIZE_PX,
  FPS,
} from './canvas.constants.js';

const AVATAR_SCALED_LABEL = 'channel_avatar_scaled';

/** Render circle at 4× then Lanczos-down for a sharp disk + clean AA edge. */
const AVATAR_SUPERSAMPLE = 4;
/** White ring thickness in final pixels (~YouTube-style). */
const AVATAR_BORDER_PX = 2;
/** Outer alpha feather in supersampled pixels (≈0.5px after downscale). */
const AVATAR_EDGE_FEATHER_HI = 2;

function buildCircleMaskFilter(): string {
  const size = CHANNEL_AVATAR_SIZE_PX;
  const hi = size * AVATAR_SUPERSAMPLE;
  const borderHi = AVATAR_BORDER_PX * AVATAR_SUPERSAMPLE;
  const feather = AVATAR_EDGE_FEATHER_HI;
  const d = 'hypot(X-W/2,Y-H/2)';
  const r = 'min(W,H)/2';

  const geq =
    `format=rgba,geq=` +
    `r='if(gte(${d},${r}-${borderHi}),255,r(X,Y))':` +
    `g='if(gte(${d},${r}-${borderHi}),255,g(X,Y))':` +
    `b='if(gte(${d},${r}-${borderHi}),255,b(X,Y))':` +
    `a='if(gte(${d},${r}),0,if(lte(${d},${r}-${feather}),255,255*(${r}-${d})/${feather}))'`;

  return (
    `fps=${FPS},` +
    `scale=${hi}:${hi}:force_original_aspect_ratio=increase:flags=lanczos,` +
    `crop=${hi}:${hi},` +
    `${geq},` +
    `scale=${size}:${size}:flags=lanczos`
  );
}

async function buildAvatarCacheKey(sourcePath: string): Promise<string> {
  const stat = await fs.stat(sourcePath);
  const raw = [
    path.basename(sourcePath).toLowerCase(),
    stat.size,
    stat.mtimeMs,
    CHANNEL_AVATAR_SIZE_PX,
    AVATAR_SUPERSAMPLE,
    AVATAR_BORDER_PX,
    AVATAR_EDGE_FEATHER_HI,
  ].join('|');
  return crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16);
}

/**
 * Lazily bake circular avatar PNG (with alpha + white ring) next to the source.
 * Merge then only overlays the static PNG — no per-frame geq/Lanczos.
 */
export async function ensurePrebakedChannelAvatar(
  sourcePath: string,
  onLog?: (msg: string) => void,
): Promise<string> {
  const cacheDir = path.join(path.dirname(sourcePath), '.cache');
  await fs.mkdir(cacheDir, { recursive: true });
  const key = await buildAvatarCacheKey(sourcePath);
  const stem = path.basename(sourcePath, path.extname(sourcePath));
  const outputPath = path.join(cacheDir, `${stem}.${key}.circle.png`);

  try {
    const stat = await fs.stat(outputPath);
    if (stat.isFile()) {
      onLog?.(`[reup-si] Avatar using prebaked circle cache: ${path.basename(outputPath)}`);
      return outputPath;
    }
  } catch {
    // miss
  }

  onLog?.(`[reup-si] Prebaking channel avatar circle → ${path.basename(outputPath)}`);
  const tempPath = `${outputPath}.tmp.png`;
  await runFfmpeg(
    ['-y', '-i', sourcePath, '-vf', buildCircleMaskFilter(), '-frames:v', '1', tempPath],
    { onLog, label: 'avatar-prebake', encoderFallback: false },
  );
  await fs.rename(tempPath, outputPath);
  return outputPath;
}

/**
 * Overlay top-right with fixed margins.
 * When `prebaked`, input is already a CHANNEL_AVATAR_SIZE_PX PNG with alpha.
 */
export function appendChannelAvatarOverlayFilters(
  filterParts: string[],
  baseVideoLabel: string,
  avatarInputLabel: string,
  outputLabel: string,
  options?: { prebaked?: boolean },
): void {
  if (options?.prebaked) {
    filterParts.push(`[${avatarInputLabel}]format=rgba[${AVATAR_SCALED_LABEL}]`);
  } else {
    filterParts.push(`[${avatarInputLabel}]${buildCircleMaskFilter()}[${AVATAR_SCALED_LABEL}]`);
  }
  filterParts.push(
    `[${baseVideoLabel}][${AVATAR_SCALED_LABEL}]overlay=W-w-${CHANNEL_AVATAR_MARGIN_RIGHT_PX}:${CHANNEL_AVATAR_MARGIN_TOP_PX}:shortest=1:format=auto[${outputLabel}]`,
  );
}
