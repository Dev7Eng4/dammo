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
  SS_FINAL_CRF,
  SS_FINAL_PRESET,
  SS_FPS,
  SS_TEMP_SCALE_FACTOR,
} from './slideshow.constants.js';
import { buildXfadeChain, type ChainTransition } from './slideshow-transitions.js';
import type { SlideshowOutputConfig, SlideshowSpec } from './slideshow.types.js';

function resolveOutputConfig(output?: Partial<SlideshowOutputConfig>): SlideshowOutputConfig {
  return {
    width: output?.width ?? SS_CANVAS_W,
    height: output?.height ?? SS_CANVAS_H,
    fps: output?.fps ?? SS_FPS,
    tempScaleFactor: output?.tempScaleFactor ?? SS_TEMP_SCALE_FACTOR,
    finalPreset: output?.finalPreset,
    finalCrf: output?.finalCrf,
  };
}

/**
 * Renders a complete slideshow from a SlideshowSpec:
 *  1. render every slide to a cached, high-quality intermediate clip,
 *  2. crossfade them together with the chained xfade filtergraph,
 *  3. encode the final mp4 (video only, no audio in this phase).
 */
export async function assembleSlideshow(spec: SlideshowSpec): Promise<string> {
  const { slides, workDir, outputPath } = spec;
  const log = (msg: string) => {
    console.log(msg);
    spec.onLog?.(msg);
  };

  if (slides.length === 0) {
    throw new Error('Slideshow requires at least one slide');
  }

  const cfg = resolveOutputConfig(spec.output);
  await fs.mkdir(workDir, { recursive: true });
  const cacheDir = path.join(workDir, SS_CACHE_DIRNAME);
  await fs.mkdir(cacheDir, { recursive: true });

  const concurrency = resolveSlideshowClipConcurrency();
  const encoder = resolveFfmpegHwEncoder();
  log(
    `[slideshow] rendering ${slides.length} slide clip(s) @ ${cfg.width}x${cfg.height} ${cfg.fps}fps ` +
      `(concurrency=${concurrency}, encoder=${encoder})`,
  );

  const clipPaths = await mapPool(slides, concurrency, (slide, index) =>
    renderSlideClip(slide, {
      width: cfg.width,
      height: cfg.height,
      fps: cfg.fps,
      tempScaleFactor: cfg.tempScaleFactor,
      cacheDir,
      onLog: msg => spec.onLog?.(`[slideshow] [${index + 1}/${slides.length}] ${msg}`),
    }),
  );

  const durations = slides.map(s => s.durationSec);
  const transitions: ChainTransition[] = slides.slice(0, -1).map(s => ({
    type: s.transitionToNext ?? 'fade',
    durationSec: s.transitionDurationSec ?? SS_DEFAULT_TRANSITION_DURATION,
  }));

  const chain = buildXfadeChain({ clipCount: clipPaths.length, durations, transitions });
  const pixFmt = resolveOutputPixelFormat();
  const slideshowEncodeOpts = {
    preset: cfg.finalPreset ?? SS_FINAL_PRESET,
    crf: cfg.finalCrf ?? SS_FINAL_CRF,
  };

  const finalFilter =
    `${chain.filter ? `${chain.filter};` : ''}` +
    `[${chain.outLabel}]format=${pixFmt},fps=${cfg.fps},setsar=1[vout]`;

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

  log(`[slideshow] composing final video (~${chain.totalDuration.toFixed(1)}s)...`);
  await runFfmpeg(args, {
    onProgress: p => spec.onLog?.(`[slideshow] encode ${p.progress}% ETA ${p.eta}`),
    encodeOpts: slideshowEncodeOpts,
    onLog: spec.onLog,
    label: 'slideshow-compose',
  });

  await fs.unlink(filterScriptPath).catch(() => undefined);

  log(`[slideshow] saved -> ${outputPath}`);
  return outputPath;
}
