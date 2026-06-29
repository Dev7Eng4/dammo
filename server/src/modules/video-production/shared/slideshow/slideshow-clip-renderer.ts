import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { runFfmpeg } from '../../../../infrastructure/ffmpeg/ffmpeg-runner.js';
import { buildSlideVideoFilter } from './ken-burns.js';
import { SS_CLIP_CRF, SS_CLIP_PRESET, SS_PIXEL_FORMAT } from './slideshow.constants.js';
import type { SlideSpec } from './slideshow.types.js';

export interface RenderClipOptions {
  width: number;
  height: number;
  fps: number;
  tempScaleFactor: number;
  cacheDir: string;
  crf?: number;
  preset?: string;
  onLog?: (msg: string) => void;
}

function cacheKeyFor(slide: SlideSpec, opts: RenderClipOptions, filter: string): string {
  let imageTag = slide.imagePath;
  try {
    const st = fs.statSync(slide.imagePath);
    imageTag = `${slide.imagePath}:${st.mtimeMs}:${st.size}`;
  } catch {
    // fall back to path-only tag (renderer will fail later if truly missing)
  }
  const payload = JSON.stringify({
    imageTag,
    durationSec: slide.durationSec,
    fit: slide.fit ?? 'cover',
    w: opts.width,
    h: opts.height,
    fps: opts.fps,
    crf: opts.crf ?? SS_CLIP_CRF,
    preset: opts.preset ?? SS_CLIP_PRESET,
    filter,
  });
  return crypto.createHash('sha1').update(payload).digest('hex').slice(0, 16);
}

/**
 * Renders a single slide (one image) to a high-quality intermediate mp4 with its
 * Ken Burns animation. Results are cached by a hash of the source image and all
 * render parameters, mirroring the prebake approach used by the SI pipeline.
 */
export async function renderSlideClip(slide: SlideSpec, opts: RenderClipOptions): Promise<string> {
  if (!fs.existsSync(slide.imagePath)) {
    throw new Error(`Slideshow image not found: ${slide.imagePath}`);
  }

  const fit = slide.fit ?? 'cover';
  const filter = buildSlideVideoFilter(slide.kenBurns, {
    width: opts.width,
    height: opts.height,
    fps: opts.fps,
    durationSec: slide.durationSec,
    tempScaleFactor: opts.tempScaleFactor,
    fit,
  });

  const key = cacheKeyFor(slide, opts, filter);
  const clipPath = path.join(opts.cacheDir, `clip_${key}.mp4`);

  if (fs.existsSync(clipPath)) {
    opts.onLog?.(`[slideshow] cache hit ${path.basename(slide.imagePath)} -> ${path.basename(clipPath)}`);
    return clipPath;
  }

  fs.mkdirSync(opts.cacheDir, { recursive: true });

  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-loop',
    '1',
    '-i',
    slide.imagePath,
    '-t',
    String(slide.durationSec),
    '-vf',
    filter,
    '-r',
    String(opts.fps),
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    opts.preset ?? SS_CLIP_PRESET,
    '-crf',
    String(opts.crf ?? SS_CLIP_CRF),
    '-pix_fmt',
    SS_PIXEL_FORMAT,
    clipPath,
  ];

  opts.onLog?.(`[slideshow] rendering clip ${path.basename(slide.imagePath)} (${slide.durationSec}s)`);
  await runFfmpeg(args);
  return clipPath;
}
