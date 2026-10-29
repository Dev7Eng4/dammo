import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  appendPixelFormatToVideoFilter,
  buildH264VideoEncoderArgs,
  resolveOutputPixelFormat,
} from '../../../../infrastructure/ffmpeg/ffmpeg-encoder.js';
import { runFfmpeg } from '../../../../infrastructure/ffmpeg/ffmpeg-runner.js';
import {
  adaptKenBurnsForDuration,
  buildSlideVideoFilter,
  resolveKenBurnsAnimationSec,
} from './ken-burns.js';
import { emitDetailLog } from '../video-log.js';
import {
  SS_CLIP_CRF,
  SS_CLIP_PRESET,
  isKenBurnsEnabled,
  SS_MAX_KEN_BURNS_ANIMATION_SEC,
} from './slideshow.constants.js';
import type { KenBurnsAdaptConfig, SlideSpec } from './slideshow.types.js';

export interface RenderClipOptions {
  width: number;
  height: number;
  fps: number;
  tempScaleFactor: number;
  cacheDir: string;
  crf?: number;
  preset?: string;
  kenBurnsAdapt?: KenBurnsAdaptConfig;
  /** When set, overrides the live app Ken Burns switch for this render. */
  enableKenBurns?: boolean;
  onLog?: (msg: string) => void;
}

/** The slide's video clip when one is set and exists on disk. */
function activeVideoPath(slide: SlideSpec): string | undefined {
  return slide.videoPath && fs.existsSync(slide.videoPath) ? slide.videoPath : undefined;
}

/** Cover-fit the clip to the canvas and freeze its last frame to fill `durationSec`. */
function videoClipFilter(slide: SlideSpec, opts: RenderClipOptions): string {
  return appendPixelFormatToVideoFilter(
    `scale=${opts.width}:${opts.height}:force_original_aspect_ratio=increase,` +
      `crop=${opts.width}:${opts.height},setsar=1,fps=${opts.fps},` +
      `tpad=stop_mode=clone:stop_duration=${slide.durationSec}`,
  );
}

function slideClipFilter(slide: SlideSpec, opts: RenderClipOptions): string {
  if (activeVideoPath(slide)) return videoClipFilter(slide, opts);
  const fit = slide.fit ?? 'cover';
  const maxAnimSec = slide.maxKenBurnsAnimationSec ?? SS_MAX_KEN_BURNS_ANIMATION_SEC;
  const animSec = resolveKenBurnsAnimationSec(slide.durationSec, maxAnimSec);
  const kenBurnsOn = opts.enableKenBurns ?? isKenBurnsEnabled();
  const kenBurns = kenBurnsOn && slide.kenBurns
    ? adaptKenBurnsForDuration(slide.kenBurns, animSec, {
        width: opts.width,
        height: opts.height,
        fps: opts.fps,
        tempScaleFactor: opts.tempScaleFactor,
        ...opts.kenBurnsAdapt,
      })
    : undefined;

  return appendPixelFormatToVideoFilter(
    buildSlideVideoFilter(kenBurns, {
      width: opts.width,
      height: opts.height,
      fps: opts.fps,
      durationSec: slide.durationSec,
      tempScaleFactor: opts.tempScaleFactor,
      maxKenBurnsAnimationSec: maxAnimSec,
      fit,
    }),
  );
}

function cacheKeyFor(slide: SlideSpec, opts: RenderClipOptions, filter: string): string {
  const sourcePath = activeVideoPath(slide) ?? slide.imagePath;
  let imageTag = sourcePath;
  try {
    const st = fs.statSync(sourcePath);
    imageTag = `${sourcePath}:${st.mtimeMs}:${st.size}`;
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

function clipCachePath(slide: SlideSpec, opts: RenderClipOptions, filter: string): string {
  const key = cacheKeyFor(slide, opts, filter);
  return path.join(opts.cacheDir, `clip_${key}.mp4`);
}

/** Cache path for this image and these render settings. Does not encode. */
export function resolveSlideClipCachePath(slide: SlideSpec, opts: RenderClipOptions): string {
  return clipCachePath(slide, opts, slideClipFilter(slide, opts));
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

  const filter = slideClipFilter(slide, opts);
  const clipPath = clipCachePath(slide, opts, filter);

  if (fs.existsSync(clipPath)) {
    emitDetailLog(
      `[slideshow] cache hit ${path.basename(slide.imagePath)} -> ${path.basename(clipPath)}`,
      opts.onLog,
    );
    return clipPath;
  }

  fs.mkdirSync(opts.cacheDir, { recursive: true });

  const encodeOpts = {
    preset: opts.preset ?? SS_CLIP_PRESET,
    crf: opts.crf ?? SS_CLIP_CRF,
  };
  const pixFmt = resolveOutputPixelFormat();

  const videoPath = activeVideoPath(slide);
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    ...(videoPath ? ['-i', videoPath] : ['-loop', '1', '-i', slide.imagePath]),
    '-t',
    String(slide.durationSec),
    '-vf',
    filter,
    '-r',
    String(opts.fps),
    '-an',
    ...buildH264VideoEncoderArgs(encodeOpts),
    '-pix_fmt',
    pixFmt,
    clipPath,
  ];

  emitDetailLog(
    `[slideshow] rendering ${videoPath ? 'video ' : ''}clip ${path.basename(videoPath ?? slide.imagePath)} (${slide.durationSec}s)`,
    opts.onLog,
  );
  await runFfmpeg(args, { encodeOpts, onLog: opts.onLog, label: 'slideshow-clip' });
  return clipPath;
}
