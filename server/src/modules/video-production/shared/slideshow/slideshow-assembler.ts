import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildH264VideoEncoderArgs,
  resolveFfmpegHwEncoder,
  resolveOutputPixelFormat,
} from '../../../../infrastructure/ffmpeg/ffmpeg-encoder.js';
import { runFfmpeg } from '../../../../infrastructure/ffmpeg/ffmpeg-runner.js';
import { mapPool } from '../../../../shared/async/map-pool.js';
import { renderSlideClip } from './slideshow-clip-renderer.js';
import {
  resolveSlideshowClipConcurrency,
  SS_CACHE_DIRNAME,
  SS_CANVAS_H,
  SS_CANVAS_W,
  SS_DEFAULT_TRANSITION_DURATION,
  SS_ENABLE_IMAGE_TRANSITIONS,
  SS_ENABLE_KEN_BURNS,
  SS_FINAL_CRF,
  SS_FINAL_PRESET,
  SS_FPS,
  SS_TEMP_SCALE_FACTOR,
} from './slideshow.constants.js';
import {
  buildHardCutChain,
  buildXfadeChain,
  type ChainTransition,
} from './slideshow-transitions.js';
import type { SlideshowOutputConfig, SlideshowSpec } from './slideshow.types.js';

export interface PreparedSlideshow {
  clipPaths: string[];
  filter: string;
  outLabel: string;
  totalDuration: number;
  config: SlideshowOutputConfig;
  cacheDir: string;
}

export type SlideshowPreparationSpec = Omit<SlideshowSpec, 'outputPath'> & { outputPath?: string };

export function resolveSlideshowOutputConfig(output?: Partial<SlideshowOutputConfig>): SlideshowOutputConfig {
  return {
    width: output?.width ?? SS_CANVAS_W,
    height: output?.height ?? SS_CANVAS_H,
    fps: output?.fps ?? SS_FPS,
    tempScaleFactor: output?.tempScaleFactor ?? SS_TEMP_SCALE_FACTOR,
    finalPreset: output?.finalPreset,
    finalCrf: output?.finalCrf,
    kenBurnsAdapt: output?.kenBurnsAdapt,
  };
}

/**
 * Render/cache the expensive Ken Burns clips and build the transition chain.
 * Callers may encode this chain themselves to avoid an intermediate compose.
 */
export async function prepareSlideshow(spec: SlideshowPreparationSpec): Promise<PreparedSlideshow> {
  const { slides, workDir } = spec;
  const log = (msg: string) => {
    console.log(msg);
    spec.onLog?.(msg);
  };

  if (slides.length === 0) {
    throw new Error('Slideshow requires at least one slide');
  }

  const cfg = resolveSlideshowOutputConfig(spec.output);
  await fs.mkdir(workDir, { recursive: true });
  const cacheDir = path.join(workDir, SS_CACHE_DIRNAME);
  await fs.mkdir(cacheDir, { recursive: true });

  const concurrency = resolveSlideshowClipConcurrency();
  const encoder = resolveFfmpegHwEncoder();
  log(
    `[slideshow] rendering ${slides.length} slide clip(s) @ ${cfg.width}x${cfg.height} ${cfg.fps}fps ` +
      `(kenBurns=${SS_ENABLE_KEN_BURNS ? 'on' : 'off'}, ` +
      `transitions=${SS_ENABLE_IMAGE_TRANSITIONS ? 'on' : 'off'}, ` +
      `concurrency=${concurrency}, encoder=${encoder})`,
  );

  const clipsStartedAt = performance.now();
  const clipPaths = await mapPool(slides, concurrency, (slide, index) =>
    renderSlideClip(slide, {
      width: cfg.width,
      height: cfg.height,
      fps: cfg.fps,
      tempScaleFactor: cfg.tempScaleFactor,
      cacheDir,
      ...(cfg.kenBurnsAdapt ? { kenBurnsAdapt: cfg.kenBurnsAdapt } : {}),
      onLog: msg => spec.onLog?.(`[slideshow] [${index + 1}/${slides.length}] ${msg}`),
    }),
  );
  log(
    `[slideshow] clip phase completed | clips=${clipPaths.length} | ` +
      `wall=${((performance.now() - clipsStartedAt) / 1000).toFixed(1)}s | concurrency=${concurrency}`,
  );

  const durations = slides.map(s => s.durationSec);
  const transitions: ChainTransition[] = slides.slice(0, -1).map(s => ({
    type: s.transitionToNext ?? 'fade',
    durationSec: s.transitionDurationSec ?? SS_DEFAULT_TRANSITION_DURATION,
  }));
  const chain = SS_ENABLE_IMAGE_TRANSITIONS
    ? buildXfadeChain({ clipCount: clipPaths.length, durations, transitions })
    : buildHardCutChain(clipPaths.length, durations);

  return {
    clipPaths,
    filter: chain.filter,
    outLabel: chain.outLabel,
    totalDuration: chain.totalDuration,
    config: cfg,
    cacheDir,
  };
}

/**
 * Renders a complete slideshow from a SlideshowSpec:
 *  1. render every slide to a cached, high-quality intermediate clip,
 *  2. crossfade them together with the chained xfade filtergraph,
 *  3. encode the final mp4 (video only, no audio in this phase).
 */
export async function assembleSlideshow(spec: SlideshowSpec): Promise<string> {
  const { workDir, outputPath } = spec;
  const log = (msg: string) => {
    console.log(msg);
    spec.onLog?.(msg);
  };

  const prepared = await prepareSlideshow(spec);
  const { clipPaths, config: cfg } = prepared;
  const pixFmt = resolveOutputPixelFormat();
  const slideshowEncodeOpts = {
    preset: cfg.finalPreset ?? SS_FINAL_PRESET,
    crf: cfg.finalCrf ?? SS_FINAL_CRF,
  };

  const finalFilter =
    `${prepared.filter ? `${prepared.filter};` : ''}` +
    `[${prepared.outLabel}]format=${pixFmt},fps=${cfg.fps},setsar=1[vout]`;

  const filterScriptPath = path.join(workDir, 'slideshow_filter.txt');
  await fs.writeFile(filterScriptPath, finalFilter, 'utf-8');

  const args = ['-hide_banner', '-y'];
  for (const clip of clipPaths) {
    args.push('-i', clip);
  }
  args.push(
    '-filter_complex_script',
    filterScriptPath,
    '-map',
    '[vout]',
    '-r',
    String(cfg.fps),
    '-an',
    ...buildH264VideoEncoderArgs(slideshowEncodeOpts),
    '-pix_fmt',
    pixFmt,
    '-movflags',
    '+faststart',
    outputPath,
  );

  log(`[slideshow] composing final video (~${prepared.totalDuration.toFixed(1)}s)...`);
  await runFfmpeg(args, {
    onProgress: p => spec.onLog?.(`[slideshow] encode ${p.progress}% ETA ${p.eta}`),
    expectedDurationSec: prepared.totalDuration,
    encodeOpts: slideshowEncodeOpts,
    onLog: spec.onLog,
    label: 'slideshow-compose',
  });

  await fs.unlink(filterScriptPath).catch(() => undefined);

  log(`[slideshow] saved -> ${outputPath}`);
  return outputPath;
}
