import fs from 'node:fs/promises';
import path from 'node:path';
import { runFfmpeg } from '../../../../infrastructure/ffmpeg/ffmpeg-runner.js';
import { renderSlideClip } from './slideshow-clip-renderer.js';
import {
  SS_CACHE_DIRNAME,
  SS_CANVAS_H,
  SS_CANVAS_W,
  SS_DEFAULT_TRANSITION_DURATION,
  SS_FINAL_CRF,
  SS_FINAL_PRESET,
  SS_FPS,
  SS_PIXEL_FORMAT,
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

  log(`[slideshow] rendering ${slides.length} slide clip(s) @ ${cfg.width}x${cfg.height} ${cfg.fps}fps`);
  const clipPaths: string[] = [];
  for (const slide of slides) {
    const clip = await renderSlideClip(slide, {
      width: cfg.width,
      height: cfg.height,
      fps: cfg.fps,
      tempScaleFactor: cfg.tempScaleFactor,
      cacheDir,
      onLog: spec.onLog,
    });
    clipPaths.push(clip);
  }

  const durations = slides.map(s => s.durationSec);
  const transitions: ChainTransition[] = slides.slice(0, -1).map(s => ({
    type: s.transitionToNext ?? 'fade',
    durationSec: s.transitionDurationSec ?? SS_DEFAULT_TRANSITION_DURATION,
  }));

  const chain = buildXfadeChain({ clipCount: clipPaths.length, durations, transitions });

  const finalFilter =
    `${chain.filter ? `${chain.filter};` : ''}` +
    `[${chain.outLabel}]format=${SS_PIXEL_FORMAT},fps=${cfg.fps},setsar=1[vout]`;

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
    '-c:v',
    'libx264',
    '-preset',
    SS_FINAL_PRESET,
    '-crf',
    String(SS_FINAL_CRF),
    '-pix_fmt',
    SS_PIXEL_FORMAT,
    '-movflags',
    '+faststart',
    outputPath,
  );

  log(`[slideshow] composing final video (~${chain.totalDuration.toFixed(1)}s)...`);
  await runFfmpeg(args, p => spec.onLog?.(`[slideshow] encode ${p.progress}% ETA ${p.eta}`));

  await fs.unlink(filterScriptPath).catch(() => undefined);

  log(`[slideshow] saved -> ${outputPath}`);
  return outputPath;
}
