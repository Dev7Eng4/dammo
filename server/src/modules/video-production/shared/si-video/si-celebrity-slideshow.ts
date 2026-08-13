import crypto from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { runFfmpeg } from '../../../../infrastructure/ffmpeg/ffmpeg-runner.js';
import { mapPool } from '../../../../shared/async/map-pool.js';
import { AppError } from '../../../../shared/http/errors.js';
import {
  resolveSlideshowClipConcurrency,
  SS_CACHE_DIRNAME,
} from '../slideshow/slideshow.constants.js';
import { buildXfadeChain } from '../slideshow/slideshow-transitions.js';
import {
  SI_CELEBRITY_IMAGE_DURATION_SEC,
  SI_CELEBRITY_MAX_IMAGES,
  SI_CELEBRITY_SLIDESHOW_BASENAME,
  SI_CELEBRITY_TRANSITION_DURATION_SEC,
  SI_CENTER_VIDEO_H,
  SI_CENTER_VIDEO_W,
  SI_FPS,
  SI_MULTI_IMAGE_DIRNAME,
} from './si.constants.js';

export function resolveSiCelebritySlideshowPath(workDir: string): string {
  return path.join(workDir, `${SI_CELEBRITY_SLIDESHOW_BASENAME}.mov`);
}

function imageCacheTag(imagePath: string): string {
  try {
    const st = fs.statSync(imagePath);
    return `${imagePath}:${st.mtimeMs}:${st.size}`;
  } catch {
    return imagePath;
  }
}

/**
 * Render one cutout image onto a transparent WxH canvas with contain fit
 * (scale down to fit, centered). Output is qtrle ARGB so alpha is preserved.
 */
async function renderCelebritySlideClip(options: {
  imagePath: string;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  cacheDir: string;
  onLog?: (msg: string) => void;
}): Promise<string> {
  const { imagePath, width, height, fps, durationSec, cacheDir, onLog } = options;
  if (!fs.existsSync(imagePath)) {
    throw new AppError(`Celebrity image not found: ${imagePath}`, 400, 'CELEBRITY_IMAGE_MISSING');
  }

  const payload = JSON.stringify({
    imageTag: imageCacheTag(imagePath),
    width,
    height,
    fps,
    durationSec,
    // contain; scale decrease + center overlay on transparent canvas
    variant: 'celebrity-contain-center-v1',
  });
  const key = crypto.createHash('sha1').update(payload).digest('hex').slice(0, 16);
  const clipPath = path.join(cacheDir, `celeb_clip_${key}.mov`);

  if (fs.existsSync(clipPath)) {
    onLog?.(`[celebrity-slideshow] cache hit ${path.basename(imagePath)} -> ${path.basename(clipPath)}`);
    return clipPath;
  }

  await fsPromises.mkdir(cacheDir, { recursive: true });

  // lavfi `black@0.0` does not yield real alpha on this ffmpeg — force aa=0 after rgba.
  const transparentBg = `color=c=black:s=${width}x${height}:d=${durationSec}:r=${fps},format=rgba,colorchannelmixer=aa=0`;

  const filter =
    `[1:v]format=rgba[bg];` +
    `[0:v]format=rgba,` +
    `scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos[img];` +
    `[bg][img]overlay=(W-w)/2:(H-h)/2:format=auto:shortest=1[vout]`;

  const tempPath = `${clipPath}.tmp.mov`;
  onLog?.(
    `[celebrity-slideshow] render ${path.basename(imagePath)} contain center ${width}x${height} ${durationSec}s`,
  );

  await runFfmpeg(
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-loop',
      '1',
      '-i',
      imagePath,
      '-f',
      'lavfi',
      '-i',
      transparentBg,
      '-filter_complex',
      filter,
      '-map',
      '[vout]',
      '-t',
      String(durationSec),
      '-an',
      '-c:v',
      'qtrle',
      '-pix_fmt',
      'argb',
      tempPath,
    ],
    {
      onLog,
      label: 'celebrity-slide-clip',
      encoderFallback: false,
      expectedDurationSec: durationSec,
    },
  );

  await fsPromises.rename(tempPath, clipPath);
  return clipPath;
}

async function composeCelebrityClips(options: {
  clipPaths: string[];
  durations: number[];
  transitionDurationSec: number;
  outputPath: string;
  onLog?: (msg: string) => void;
}): Promise<void> {
  const { clipPaths, durations, transitionDurationSec, outputPath, onLog } = options;
  if (clipPaths.length === 0) {
    throw new AppError('Celebrity slideshow requires at least one clip', 400, 'CELEBRITY_IMAGES_EMPTY');
  }

  if (clipPaths.length === 1) {
    await fsPromises.copyFile(clipPaths[0], outputPath);
    return;
  }

  const transitions = durations.slice(0, -1).map(() => ({
    type: 'fade' as const,
    durationSec: transitionDurationSec,
  }));

  const chain = buildXfadeChain({
    clipCount: clipPaths.length,
    durations,
    transitions,
  });

  const prepParts: string[] = [];
  for (let i = 0; i < clipPaths.length; i++) {
    prepParts.push(`[${i}:v]format=yuva420p[c${i}]`);
  }

  // Remap chain labels 0:v, 1:v, ... → c0, c1, ...
  let remappedFilter = chain.filter;
  for (let i = 0; i < clipPaths.length; i++) {
    remappedFilter = remappedFilter.replaceAll(`[${i}:v]`, `[c${i}]`);
  }
  const outLabel = chain.outLabel === '0:v' ? 'c0' : chain.outLabel;

  const finalFilter =
    `${prepParts.join(';')};` +
    `${remappedFilter};` +
    `[${outLabel}]format=rgba[vout]`;

  const filterScriptPath = `${outputPath}.filter.txt`;
  await fsPromises.writeFile(filterScriptPath, finalFilter, 'utf-8');

  const args = ['-hide_banner', '-y'];
  for (const clip of clipPaths) {
    args.push('-i', clip);
  }
  args.push(
    '-filter_complex_script',
    filterScriptPath,
    '-map',
    '[vout]',
    '-an',
    '-c:v',
    'qtrle',
    '-pix_fmt',
    'argb',
    outputPath,
  );

  onLog?.(
    `[celebrity-slideshow] composing ${clipPaths.length} clips (~${chain.totalDuration.toFixed(1)}s) with alpha fade...`,
  );

  try {
    await runFfmpeg(args, {
      onLog,
      label: 'celebrity-slideshow-compose',
      encoderFallback: false,
      expectedDurationSec: chain.totalDuration,
    });
  } finally {
    await fsPromises.unlink(filterScriptPath).catch(() => undefined);
  }
}

/**
 * Build an alpha-preserving celebrity center slideshow:
 * contain-centered cutouts (fit inside the box, letterbox transparent) on a
 * transparent canvas, fade between slides.
 */
export async function assembleSiCelebrityCenterSlideshow(options: {
  workDir: string;
  imagePaths: string[];
  width?: number;
  height?: number;
  onLog?: (msg: string) => void;
}): Promise<string> {
  const {
    workDir,
    imagePaths,
    width = SI_CENTER_VIDEO_W,
    height = SI_CENTER_VIDEO_H,
    onLog,
  } = options;

  const paths = imagePaths
    .filter(p => Boolean(p?.trim()))
    .slice(0, SI_CELEBRITY_MAX_IMAGES);

  if (paths.length === 0) {
    throw new AppError(
      `SI celebrity slideshow requires at least one image in ${SI_MULTI_IMAGE_DIRNAME}/`,
      400,
      'CELEBRITY_IMAGES_EMPTY',
    );
  }

  await fsPromises.mkdir(workDir, { recursive: true });
  const cacheDir = path.join(workDir, SS_CACHE_DIRNAME);
  await fsPromises.mkdir(cacheDir, { recursive: true });

  const durationSec = SI_CELEBRITY_IMAGE_DURATION_SEC;
  const concurrency = resolveSlideshowClipConcurrency();
  onLog?.(
    `[celebrity-slideshow] rendering ${paths.length} transparent clip(s) @ ${width}x${height} ` +
      `${durationSec}s each (concurrency=${concurrency})`,
  );

  const clipPaths = await mapPool(paths, concurrency, (imagePath, index) =>
    renderCelebritySlideClip({
      imagePath,
      width,
      height,
      fps: SI_FPS,
      durationSec,
      cacheDir,
      onLog: msg => onLog?.(`[celebrity-slideshow] [${index + 1}/${paths.length}] ${msg}`),
    }),
  );

  const outputPath = resolveSiCelebritySlideshowPath(workDir);
  const tempOut = `${outputPath}.tmp.mov`;
  await composeCelebrityClips({
    clipPaths,
    durations: paths.map(() => durationSec),
    transitionDurationSec: SI_CELEBRITY_TRANSITION_DURATION_SEC,
    outputPath: tempOut,
    onLog,
  });
  await fsPromises.rename(tempOut, outputPath);

  onLog?.(
    `[celebrity-slideshow] saved ${path.basename(outputPath)} (${paths.length} images × ${durationSec}s)`,
  );
  return outputPath;
}

export async function cleanupSiCelebritySlideshowArtifacts(workDir: string): Promise<void> {
  await fsPromises.unlink(resolveSiCelebritySlideshowPath(workDir)).catch(() => undefined);
}
