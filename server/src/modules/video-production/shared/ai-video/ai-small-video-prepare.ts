import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { paths } from '../../../../config/paths.js';
import { runFfmpeg } from '../../../../infrastructure/ffmpeg/ffmpeg-runner.js';
import { SI_FPS } from '../si-video/si.constants.js';
import {
  AI_SMALL_VIDEO_H,
  AI_SMALL_VIDEO_OPACITY,
  AI_SMALL_VIDEO_SLOW,
  AI_SMALL_VIDEO_W,
} from './ai-video.constants.js';

function cacheDir(): string {
  return path.join(paths.siSmallVideoDir, '.cache', 'ai-pip');
}

async function buildCacheKey(sourcePath: string): Promise<string> {
  const stat = await fs.stat(sourcePath);
  const raw = [
    path.basename(sourcePath).toLowerCase(),
    stat.size,
    stat.mtimeMs,
    AI_SMALL_VIDEO_W,
    AI_SMALL_VIDEO_H,
    AI_SMALL_VIDEO_OPACITY,
    AI_SMALL_VIDEO_SLOW,
    SI_FPS,
    'ai-pip-v1',
  ].join('|');
  return crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16);
}

async function resolveOutputPath(sourcePath: string): Promise<string> {
  const cacheKey = await buildCacheKey(sourcePath);
  const stem = path.basename(sourcePath, path.extname(sourcePath));
  return path.join(cacheDir(), `${stem}.${cacheKey}.alpha.mov`);
}

function buildPrebakeFilter(): string {
  return [
    `fps=${SI_FPS}`,
    `setpts=${AI_SMALL_VIDEO_SLOW}*PTS`,
    `scale=${AI_SMALL_VIDEO_W}:${AI_SMALL_VIDEO_H}:force_original_aspect_ratio=increase:flags=fast_bilinear`,
    `crop=${AI_SMALL_VIDEO_W}:${AI_SMALL_VIDEO_H}`,
    'format=rgba',
    `colorchannelmixer=aa=${AI_SMALL_VIDEO_OPACITY}`,
  ].join(',');
}

export async function ensurePrebakedAiSmallVideo(
  sourcePath: string,
  onLog?: (msg: string) => void,
): Promise<{ path: string; cached: boolean }> {
  const outputPath = await resolveOutputPath(sourcePath);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  try {
    const stat = await fs.stat(outputPath);
    if (stat.isFile()) {
      onLog?.(`[ai-video] Small video PiP cache hit: ${path.basename(outputPath)}`);
      return { path: outputPath, cached: true };
    }
  } catch {
    // not cached yet
  }

  onLog?.(
    `[ai-video] Prebaking small video PiP (${AI_SMALL_VIDEO_W}x${AI_SMALL_VIDEO_H}, opacity ${AI_SMALL_VIDEO_OPACITY}, slow ${AI_SMALL_VIDEO_SLOW}x)...`,
  );
  const tempPath = `${outputPath}.tmp.mov`;
  await runFfmpeg(
    ['-y', '-i', sourcePath, '-vf', buildPrebakeFilter(), '-an', '-c:v', 'qtrle', '-pix_fmt', 'argb', tempPath],
    { onLog, label: 'ai-small-video-prebake', encodeOpts: { preset: 'fast' } },
  );
  await fs.rename(tempPath, outputPath);
  return { path: outputPath, cached: false };
}
