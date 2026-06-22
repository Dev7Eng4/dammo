import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { env } from '../../../../config/env.js';
import {
  SI_CANVAS_H,
  SI_CANVAS_W,
  SI_FPS,
  SI_STOCK_OVERLAY_OPACITY,
  SI_STOCK_OVERLAY_PTS_MULT,
  SI_STOCK_OVERLAY_ZOOM,
} from './si.constants.js';

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(env.ffmpegPath, args);
    let stderr = '';

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('close', code => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-300)}`));
    });

    proc.on('error', err => {
      reject(new Error(`ffmpeg not available: ${err.message}`));
    });
  });
}

function stockOverlayScaleCropAlphaSubchain(): string {
  const w = SI_CANVAS_W;
  const h = SI_CANVAS_H;
  const z = SI_STOCK_OVERLAY_ZOOM;
  const a = SI_STOCK_OVERLAY_OPACITY;
  return `scale=w='iw*${z}':h='ih*${z}',crop=${w}:${h}:(iw-ow)/2:ih-oh,format=yuva420p,colorchannelmixer=aa=${a}`;
}

export async function getPrebakedNoiseMov(
  sourcePath: string,
  w: number,
  h: number,
  fps: number,
  alpha: number,
): Promise<string | null> {
  if (!sourcePath || !fs.existsSync(sourcePath)) return null;

  const cacheDir = path.join(path.dirname(sourcePath), '.cache');
  const st = fs.statSync(sourcePath);
  const aTag = String(Math.round(alpha * 1000)).padStart(4, '0');
  const cacheKey = `noise_${path.parse(sourcePath).name}_${w}x${h}_f${fps}_a${aTag}_${st.mtimeMs}.mov`;
  const cachePath = path.join(cacheDir, cacheKey);

  if (fs.existsSync(cachePath)) return cachePath;

  fs.mkdirSync(cacheDir, { recursive: true });
  const vf = `fps=${fps},scale=${w}:${h}:flags=fast_bilinear,format=yuva420p,colorkey=0x000000:0.1:0.1,colorchannelmixer=aa=${alpha}`;

  try {
    await runFfmpeg([
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      sourcePath,
      '-vf',
      vf,
      '-an',
      '-c:v',
      'prores_ks',
      '-profile:v',
      '4',
      '-pix_fmt',
      'yuva444p10le',
      cachePath,
    ]);
  } catch (err) {
    console.warn('[reup-si] noise prebake failed, fallback realtime:', err instanceof Error ? err.message : err);
    return null;
  }

  return cachePath;
}

export async function getPrebakedStockOverlayVideo(sourcePath: string, cacheDir: string): Promise<string | null> {
  const w = SI_CANVAS_W;
  const h = SI_CANVAS_H;
  const st = fs.statSync(sourcePath);
  const zTag = Math.round(SI_STOCK_OVERLAY_ZOOM * 100);
  const aTag = Math.round(SI_STOCK_OVERLAY_OPACITY * 100);
  const cacheKey = `ov_${path.parse(sourcePath).name}_${w}x${h}_s${SI_STOCK_OVERLAY_PTS_MULT}_z${zTag}_a${aTag}_bot_${st.mtimeMs}.mov`;
  const cachePath = path.join(cacheDir, cacheKey);

  if (fs.existsSync(cachePath)) return cachePath;

  fs.mkdirSync(cacheDir, { recursive: true });
  const vf = `setpts=${SI_STOCK_OVERLAY_PTS_MULT}*PTS,${stockOverlayScaleCropAlphaSubchain()}`;

  try {
    await runFfmpeg([
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      sourcePath,
      '-vf',
      vf,
      '-c:v',
      'prores_ks',
      '-profile:v',
      '4444',
      '-pix_fmt',
      'yuva444p10le',
      cachePath,
    ]);
  } catch (err) {
    console.warn('[reup-si] overlay prebake failed, fallback realtime:', err instanceof Error ? err.message : err);
    return null;
  }

  return cachePath;
}

export { stockOverlayScaleCropAlphaSubchain };
