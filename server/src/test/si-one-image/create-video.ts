import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFfmpegFilterComplex, type FfmpegProgress } from '../../infrastructure/ffmpeg/ffmpeg-runner.js';
import { formatClockDuration, getAudioDurationSeconds } from '../../infrastructure/ffmpeg/ffmpeg-probe.js';
import { buildH264VideoEncoderArgs, isHardwareEncoder, resolveFfmpegHwEncoder } from '../../infrastructure/ffmpeg/ffmpeg-encoder.js';
import { resizeImageToFit } from '../../infrastructure/ffmpeg/image-resize.js';
import { timedStep } from '../../shared/timing/step-timer.js';
import { assertRequiredSiAssets } from '../../modules/video-production/shared/si-video/si-assets.js';
import {
  CANVAS_H,
  CANVAS_W,
  FPS,
  SUBTITLE_BOX_OPACITY,
  SUBTITLE_MARGIN_BOTTOM_PX,
  resolveRandomAudioSpeed,
} from '../../modules/video-production/shared/render-core/canvas.constants.js';
import {
  SI_AUDIO_BAR_MARGIN_LEFT_PX,
  SI_CENTER_IMAGE_MARGIN_TOP_PX,
  SI_CENTER_IMAGE_OPACITY,
  SI_CENTER_IMAGE_WIDTH_RATIO,
  resolveSiCenterImageOverlayX,
  SI_CENTER_IMAGE_AUDIO_BAR_OFFSET_X_PX,
} from '../../modules/video-production/shared/si-video/si.constants.js';
import {
  STOCK_DIM_FACTOR,
  STOCK_SKIP_START_SEC,
  STOCK_SLOWMO_FACTOR,
  prepareRawStockVideoClip,
  stockNormalizeFilterChain,
} from '../../modules/video-production/shared/stock-background/index.js';
import { selectRandomSiAudioBarClip, appendSiAudioBarScaleFilters } from '../../modules/video-production/shared/si-video/si-audio-bar.js';
import { getCaptionStylePreset, resolveCaptionStyleKey } from '../../modules/video-production/shared/render-core/caption-styles.js';
import type { CaptionStyleKey } from '../../modules/video-production/shared/render-core/caption-styles.js';
import {
  convertSrtToAss,
  escapePathForFfmpegSubtitles,
  resolveJapaneseSubtitleStyle,
  scaleSrtTimestamps,
} from '../../modules/video-production/shared/render-core/subtitle.js';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(TEST_DIR, '../../../../output');

const STOCK_FILE = 'video.mp4';
const STOCK_PROCESSED_FILE = 'stock_processed.mp4';
const AUDIO_FILE = 'audio.mp3';
const SUBTITLE_FILE = 'transcript.srt';
const CENTER_IMAGE_FILE = 'background.jpg';
const OUTPUT_FILE = 'assembled.mp4';

const DEFAULT_LANGUAGE = 'ja';
const DEFAULT_CAPTION_STYLE: CaptionStyleKey = 'bizudp_gothic_red_white_box';

export interface CreateSiOneImageVideoInput {
  workDir?: string;
  /** Final assembled video directory (defaults to repo `output/`). */
  outputDir?: string;
  language?: string;
  captionStyleKey?: CaptionStyleKey;
  showAudioBar?: boolean;
  /** Limit output duration for smoke tests. */
  durationLimitSec?: number;
  onLog?: (msg: string) => void;
  onFfmpegProgress?: (progress: FfmpegProgress) => void;
}

async function assertFileExists(filePath: string, label: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

/**
 * Assemble an SI one_image video from local test assets:
 * video.mp4 → stock_processed.mp4, then + audio/srt/center → output/assembled.mp4
 */
export async function createSiOneImageVideo(input: CreateSiOneImageVideoInput = {}): Promise<string> {
  const {
    workDir = TEST_DIR,
    outputDir = OUTPUT_DIR,
    language = DEFAULT_LANGUAGE,
    captionStyleKey = DEFAULT_CAPTION_STYLE,
    showAudioBar = true,
    durationLimitSec,
    onLog,
    onFfmpegProgress,
  } = input;

  const log = (msg: string) => {
    console.log(msg);
    onLog?.(msg);
  };

  const rawStockPath = path.join(workDir, STOCK_FILE);
  const audioPath = path.join(workDir, AUDIO_FILE);
  const subtitlePath = path.join(workDir, SUBTITLE_FILE);
  const centerImagePath = path.join(workDir, CENTER_IMAGE_FILE);

  await assertFileExists(rawStockPath, 'stock video');
  await assertFileExists(audioPath, 'audio');
  await assertFileExists(subtitlePath, 'subtitle');
  await assertFileExists(centerImagePath, 'center image');

  const assets = assertRequiredSiAssets(captionStyleKey);
  const speed = resolveRandomAudioSpeed();
  const originalAudioDuration = await getAudioDurationSeconds(audioPath);
  const audioDurationAfterTempo = originalAudioDuration / speed;
  const outputDurationSec = durationLimitSec ? Math.min(audioDurationAfterTempo, durationLimitSec) : audioDurationAfterTempo;
  const sourceDurationSec = outputDurationSec / STOCK_SLOWMO_FACTOR;

  log(
    `[si-one-image] Audio ${originalAudioDuration.toFixed(1)}s → ${formatClockDuration(audioDurationAfterTempo)} after atempo ${speed.toFixed(3)}`,
  );
  log(`[si-one-image] Raw stock: ${rawStockPath}`);
  log(`[si-one-image] Center image margin-top: ${SI_CENTER_IMAGE_MARGIN_TOP_PX}px`);
  if (showAudioBar) {
    log('[si-one-image] Audio bar overlay: enabled');
    log(`[si-one-image] Center image offset-x: +${SI_CENTER_IMAGE_AUDIO_BAR_OFFSET_X_PX}px`);
  }
  if (durationLimitSec) {
    log(`[si-one-image] Output duration capped at ${outputDurationSec.toFixed(1)}s`);
  }

  let audioBarPath: string | undefined;
  if (showAudioBar) {
    const audioBarClip = await selectRandomSiAudioBarClip();
    audioBarPath = audioBarClip.path;
    log(`[si-one-image] Audio bar clip: ${audioBarClip.filename}`);
  }

  const outputPath = path.join(outputDir, OUTPUT_FILE);
  const stockClipPath = path.join(outputDir, STOCK_PROCESSED_FILE);
  const filterScriptPath = path.join(workDir, 'filter_complex.txt');
  const tempAssPath = path.join(workDir, 'temp_sub.ass');
  const resizedCenterImagePath = path.join(workDir, 'center_720.jpg');
  let scaledSrtPath: string | null = null;
  let activeSubtitlePath = subtitlePath;
  let mergeArgs: string[] = [];

  const stepOpts = { prefix: '[si-one-image]', onLog };

  await fs.mkdir(outputDir, { recursive: true });

  log(
    `[si-one-image] Prepare stock: target ${outputDurationSec.toFixed(1)}s after ${STOCK_SLOWMO_FACTOR}x slowmo → cut ${sourceDurationSec.toFixed(1)}s from t=${STOCK_SKIP_START_SEC}s`,
  );
  await timedStep(
    'Prepare stock clip (ffmpeg)',
    () =>
      prepareRawStockVideoClip(rawStockPath, stockClipPath, {
        skipStartSec: STOCK_SKIP_START_SEC,
        durationSec: sourceDurationSec,
        onLog,
        label: 'si-one-image-stock',
      }),
    stepOpts,
  );
  log(`[si-one-image] Processed stock → ${stockClipPath}`);

  await timedStep(
    'Chuẩn bị inputs',
    async () => {
      if (speed !== 1) {
        scaledSrtPath = path.join(workDir, 'temp_scaled_sub.srt');
        scaleSrtTimestamps(subtitlePath, scaledSrtPath, speed);
        activeSubtitlePath = scaledSrtPath;
      }

      await resizeImageToFit(centerImagePath, resizedCenterImagePath, CANVAS_W, CANVAS_H, onLog);

      mergeArgs = ['-y'];
      let inputIdx = 0;

      mergeArgs.push('-stream_loop', '-1', '-i', stockClipPath);
      const stockIndex = inputIdx++;

      const audioIndex = inputIdx++;
      mergeArgs.push('-i', audioPath);

      const centerImgIndex = inputIdx++;
      mergeArgs.push('-loop', '1', '-i', resizedCenterImagePath);

      let audioBarIndex: number | null = null;
      if (audioBarPath) {
        audioBarIndex = inputIdx++;
        mergeArgs.push('-stream_loop', '-1', '-i', audioBarPath);
      }

      const filterParts: string[] = [];
      filterParts.push(`[${audioIndex}:a]atempo=${speed}[aout]`);

      const vBgLabel = 'vout_bg';
      filterParts.push(stockNormalizeFilterChain(`${stockIndex}:v`, vBgLabel, 1.0, false));

      filterParts.push(`[${vBgLabel}]lutyuv=y='val*${STOCK_DIM_FACTOR}':u='val':v='val'[v_dimmed]`);

      const targetW = Math.round(CANVAS_W * SI_CENTER_IMAGE_WIDTH_RATIO);
      const centerImageOverlayX = resolveSiCenterImageOverlayX(showAudioBar);
      filterParts.push(
        `[${centerImgIndex}:v]fps=${FPS},scale=${targetW}:-1,format=rgba,colorchannelmixer=aa=${SI_CENTER_IMAGE_OPACITY}[center_img]`,
      );
      filterParts.push(`[v_dimmed][center_img]overlay=${centerImageOverlayX}:${SI_CENTER_IMAGE_MARGIN_TOP_PX}:shortest=1[v_centered_img]`);

      let currentVLabel = 'v_centered_img';

      if (audioBarIndex !== null) {
        appendSiAudioBarScaleFilters(filterParts, `${audioBarIndex}:v`);
        filterParts.push(
          `[${currentVLabel}][audio_bar_scaled]overlay=${SI_AUDIO_BAR_MARGIN_LEFT_PX}:(main_h-overlay_h)/2:shortest=1[v_audio_bar]`,
        );
        currentVLabel = 'v_audio_bar';
      }

      const useJaSubtitleStyle = resolveJapaneseSubtitleStyle(activeSubtitlePath, language);
      const resolvedCaptionStyleKey = resolveCaptionStyleKey(captionStyleKey);
      convertSrtToAss(activeSubtitlePath, tempAssPath, {
        captionStyleKey: resolvedCaptionStyleKey,
        japaneseStyle: useJaSubtitleStyle,
        fontFile: assets.fontPath,
      });
      const subPathEscaped = escapePathForFfmpegSubtitles(tempAssPath);
      const fontsDirEscaped = escapePathForFfmpegSubtitles(assets.fontDir);
      const captionPreset = getCaptionStylePreset(resolvedCaptionStyleKey);
      const subFilter = `subtitles='${subPathEscaped}:fontsdir=${fontsDirEscaped}'`;
      const hwEncoder = resolveFfmpegHwEncoder();
      const videoMapLabel = isHardwareEncoder(hwEncoder) ? 'venc' : 'vout_final';
      const finalFormat = isHardwareEncoder(hwEncoder) ? ',format=nv12' : '';
      const videoFilters = captionPreset.showBackgroundBox
        ? (() => {
            const subtitleBoxHeight = Math.floor(CANVAS_H / 3);
            const boxY = CANVAS_H - subtitleBoxHeight - SUBTITLE_MARGIN_BOTTOM_PX;
            const drawboxFilter = `drawbox=x=0:y=${boxY}:w=iw:h=${subtitleBoxHeight}:color=black@${SUBTITLE_BOX_OPACITY}:t=fill`;
            return `${drawboxFilter},${subFilter}`;
          })()
        : subFilter;
      filterParts.push(`[${currentVLabel}]${videoFilters}${finalFormat}[${videoMapLabel}]`);

      await fs.writeFile(filterScriptPath, filterParts.join(';'), 'utf-8');

      const siEncodeOpts = { preset: 'fast' as const };
      mergeArgs.push(
        '-filter_complex_script',
        filterScriptPath,
        '-map',
        `[${videoMapLabel}]`,
        '-map',
        '[aout]',
        ...buildH264VideoEncoderArgs(siEncodeOpts),
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-t',
        String(outputDurationSec),
        outputPath,
      );
    },
    stepOpts,
  );

  await timedStep(
    'Ghép video (ffmpeg)',
    () =>
      runFfmpegFilterComplex(mergeArgs, {
        encodeOpts: { preset: 'fast' },
        onLog,
        onProgress: onFfmpegProgress,
        expectedDurationSec: outputDurationSec,
        label: 'si-one-image-merge',
      }),
    stepOpts,
  );

  await fs.unlink(filterScriptPath).catch(() => undefined);
  await fs.unlink(tempAssPath).catch(() => undefined);
  await fs.unlink(resizedCenterImagePath).catch(() => undefined);
  if (scaledSrtPath) {
    await fs.unlink(scaledSrtPath).catch(() => undefined);
  }

  log(`[si-one-image] Video saved → ${outputPath}`);
  return outputPath;
}

function logFfmpegProgress(label: string, p: FfmpegProgress): void {
  const parts = [
    `[ffmpeg:${label}] ${p.progress}%`,
    p.time && `time=${p.time}`,
    p.bitrate && `bitrate=${p.bitrate}`,
    p.speed && `speed=${p.speed}`,
    p.fps !== undefined && `fps=${p.fps}`,
    p.eta && `eta=${p.eta}`,
    p.size && `size=${p.size}`,
  ].filter(Boolean);
  process.stdout.write(`\r${parts.join(' | ')}`);
  if (p.progress >= 100) process.stdout.write('\n');
}

async function main() {
  const showAudioBar = !process.argv.includes('--no-audio-bar');
  const durationArg = process.argv.find(arg => arg.startsWith('--duration='));
  const durationLimitSec = durationArg ? Number(durationArg.split('=')[1]) : undefined;

  console.log('SI one_image test assemble');
  console.log(`Work dir: ${TEST_DIR}`);
  console.log(`Stock: ${path.join(TEST_DIR, STOCK_FILE)}`);
  console.log(`Processed stock: ${path.join(OUTPUT_DIR, STOCK_PROCESSED_FILE)}`);
  console.log(`Audio: ${path.join(TEST_DIR, AUDIO_FILE)}`);
  console.log(`Subtitle: ${path.join(TEST_DIR, SUBTITLE_FILE)}`);
  console.log(`Center image: ${path.join(TEST_DIR, CENTER_IMAGE_FILE)}`);
  console.log(`Show audio bar: ${showAudioBar}`);
  if (durationLimitSec) {
    console.log(`Duration limit: ${durationLimitSec}s`);
  }
  console.log(`Output: ${path.join(OUTPUT_DIR, OUTPUT_FILE)}`);
  console.log('\nAssembling...\n');

  const outputPath = await createSiOneImageVideo({
    showAudioBar,
    durationLimitSec: Number.isFinite(durationLimitSec) ? durationLimitSec : undefined,
    onLog: msg => console.log(msg),
    onFfmpegProgress: p => logFfmpegProgress('merge', p),
  });

  console.log(`\nDone → ${outputPath}`);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch(err => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
