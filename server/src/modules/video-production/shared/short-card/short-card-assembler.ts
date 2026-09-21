import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildH264VideoEncoderArgs,
  type H264EncodeOptions,
} from '../../../../infrastructure/ffmpeg/ffmpeg-encoder.js';
import { getAudioDurationSeconds } from '../../../../infrastructure/ffmpeg/ffmpeg-probe.js';
import { runFfmpeg } from '../../../../infrastructure/ffmpeg/ffmpeg-runner.js';
import { AppError } from '../../../../shared/http/errors.js';
import { assembleShortCardInputSchema } from './short-card.schema.js';
import {
  SHORT_CARD_CANVAS_H,
  SHORT_CARD_CANVAS_W,
  SHORT_CARD_FPS,
  SHORT_CARD_IMAGE_EXTENSIONS,
  SHORT_CARD_OVERLAY_BASENAME,
  SHORT_CARD_VIDEO_EXTENSIONS,
} from './short-card.constants.js';
import { renderShortCardOverlayPng } from './short-card-overlay.js';
import type { AssembleShortCardInput, AssembleShortCardResult } from './short-card.types.js';

const ENCODE_OPTS: H264EncodeOptions = { preset: 'veryfast', crf: 20 };

function isImagePath(filePath: string): boolean {
  return SHORT_CARD_IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isVideoPath(filePath: string): boolean {
  return SHORT_CARD_VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

async function assertReadable(filePath: string, label: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    throw new AppError(`Missing ${label}: ${filePath}`, 404, 'SHORT_CARD_INPUT_MISSING');
  }
}

function buildBackgroundFilter(kenBurns: boolean, durationSec: number): string {
  const base =
    `scale=${SHORT_CARD_CANVAS_W}:${SHORT_CARD_CANVAS_H}:force_original_aspect_ratio=increase,` +
    `crop=${SHORT_CARD_CANVAS_W}:${SHORT_CARD_CANVAS_H},setsar=1,fps=${SHORT_CARD_FPS},format=yuv420p`;

  if (!kenBurns) {
    return `[0:v]${base}[bg]`;
  }

  // Mild zoom over the full duration (still images only).
  const frames = Math.max(1, Math.ceil(durationSec * SHORT_CARD_FPS));
  const zoompan =
    `zoompan=z='min(zoom+0.0004,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
    `d=${frames}:s=${SHORT_CARD_CANVAS_W}x${SHORT_CARD_CANVAS_H}:fps=${SHORT_CARD_FPS}`;

  return (
    `[0:v]scale=${SHORT_CARD_CANVAS_W * 2}:${SHORT_CARD_CANVAS_H * 2}:force_original_aspect_ratio=increase,` +
    `crop=${SHORT_CARD_CANVAS_W * 2}:${SHORT_CARD_CANVAS_H * 2},${zoompan},setsar=1,format=yuv420p[bg]`
  );
}

/**
 * Compose a 9:16 short: background (image/video) + transparent card overlay + audio.
 */
export async function assembleShortCardVideo(
  rawInput: AssembleShortCardInput,
): Promise<AssembleShortCardResult> {
  const { onLog, ...inputFields } = rawInput;
  const parsed = assembleShortCardInputSchema.safeParse(inputFields);
  if (!parsed.success) {
    throw new AppError(
      `Invalid short-card input: ${parsed.error.issues.map(i => i.message).join('; ')}`,
      400,
      'VALIDATION_ERROR',
    );
  }

  const input = parsed.data;
  const log = onLog ?? ((msg: string) => console.log(msg));
  const kenBurns = input.kenBurns === true;

  await assertReadable(input.backgroundPath, 'background');
  await assertReadable(input.audioPath, 'audio');

  const bgIsImage = isImagePath(input.backgroundPath);
  const bgIsVideo = isVideoPath(input.backgroundPath);
  if (!bgIsImage && !bgIsVideo) {
    throw new AppError(
      `Unsupported background type: ${path.extname(input.backgroundPath)}`,
      400,
      'SHORT_CARD_BAD_BACKGROUND',
    );
  }

  if (kenBurns && !bgIsImage) {
    throw new AppError('kenBurns is only supported for still image backgrounds', 400, 'VALIDATION_ERROR');
  }

  const durationSec = await getAudioDurationSeconds(input.audioPath);
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new AppError('Unable to resolve audio duration', 400, 'SHORT_CARD_BAD_AUDIO');
  }

  const workDir = input.workDir?.trim()
    ? path.resolve(input.workDir)
    : path.join(path.dirname(path.resolve(input.outputPath)), 'short-card-work');
  await fs.mkdir(workDir, { recursive: true });
  await fs.mkdir(path.dirname(path.resolve(input.outputPath)), { recursive: true });

  const overlayPath = path.join(workDir, SHORT_CARD_OVERLAY_BASENAME);
  await renderShortCardOverlayPng(input.content, overlayPath, { onLog: log });

  const filterComplex = [
    buildBackgroundFilter(kenBurns && bgIsImage, durationSec),
    '[bg][1:v]overlay=0:0:format=auto[vout]',
  ].join(';');

  const args: string[] = ['-y'];

  if (bgIsImage) {
    args.push('-loop', '1', '-t', durationSec.toFixed(3), '-i', input.backgroundPath);
  } else {
    args.push('-i', input.backgroundPath);
  }

  args.push(
    '-i',
    overlayPath,
    '-i',
    input.audioPath,
    '-filter_complex',
    filterComplex,
    '-map',
    '[vout]',
    '-map',
    '2:a:0',
    ...buildH264VideoEncoderArgs(ENCODE_OPTS),
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-t',
    durationSec.toFixed(3),
    '-movflags',
    '+faststart',
    path.resolve(input.outputPath),
  );

  log(
    `[short-card] Assembling ${SHORT_CARD_CANVAS_W}x${SHORT_CARD_CANVAS_H} ` +
      `(${durationSec.toFixed(1)}s, bg=${bgIsImage ? 'image' : 'video'}${kenBurns ? ', kenBurns' : ''})...`,
  );

  await runFfmpeg(args, {
    encodeOpts: ENCODE_OPTS,
    expectedDurationSec: durationSec,
    onLog: log,
    label: 'short-card-compose',
  });

  log(`[short-card] Done → ${input.outputPath}`);

  return {
    outputPath: path.resolve(input.outputPath),
    overlayPath,
    durationSec,
  };
}
