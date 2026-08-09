import fs from 'node:fs/promises';
import path from 'node:path';
import type { FfmpegProgress } from '../../../../infrastructure/ffmpeg/ffmpeg-runner.js';
import { formatClockDuration, getAudioDurationSeconds } from '../../../../infrastructure/ffmpeg/ffmpeg-probe.js';
import {
  buildH264VideoEncoderArgs,
  isHardwareEncoder,
  resolveFfmpegHwEncoder,
} from '../../../../infrastructure/ffmpeg/ffmpeg-encoder.js';
import { bakeStillWithOpacity, bakeVideoWithOpacity } from '../../../../infrastructure/ffmpeg/image-resize.js';
import { AppError } from '../../../../shared/http/errors.js';
import { timedStep } from '../../../../shared/timing/step-timer.js';
import { assertRequiredSiAssets } from './si-assets.js';
import {
  SI_AUDIO_BAR_COLORKEY,
  SI_AUDIO_BAR_COLORKEY_BLEND,
  SI_AUDIO_BAR_COLORKEY_SIMILARITY,
  SI_CANVAS_H,
  SI_CANVAS_W,
  SI_CENTER_IMAGE_MARGIN_TOP_PX,
  SI_CENTER_IMAGE_OPACITY,
  SI_FPS,
  // SI_NOISE_ALPHA, // TODO: re-enable SI noise
  SI_OUTPUT_VIDEO_BASENAME,
  SI_SUBSCRIBE_COLORKEY,
  SI_SUBSCRIBE_COLORKEY_BLEND,
  SI_SUBSCRIBE_COLORKEY_SIMILARITY,
  SI_SUBTITLE_BOX_OPACITY,
  SI_SUBTITLE_MARGIN_BOTTOM_PX,
  resolveRandomSiAudioSpeed,
  resolveRandomSiCenterImageSize,
  resolveSiCenterImageOverlayX,
} from './si.constants.js';
import {
  STOCK_DIM_FACTOR,
  STOCK_RENDER_EXTRA_SEC,
  cleanupStockTempDir,
  localStockNormalizeFilterChain,
  prepareStockBackground,
  stockNormalizeFilterChain,
  type StockBackgroundMode,
} from '../stock-background/index.js';
import { runFfmpegFilterComplex } from './si-ffmpeg.js';
import { resolveSiAudioBarClip, appendSiAudioBarScaleFilters } from './si-audio-bar.js';
import { resolveSiSmallVideoClip, appendSiSmallVideoScaleFilters } from './si-small-video.js';
import { resolveSiSubscribeClip } from './si-subscribe-video.js';
import {
  appendChannelAvatarOverlayFilters,
  ensurePrebakedChannelAvatar,
} from './channel-avatar-overlay.js';
import {
  assignSiOverlayLayout,
  type SiMovableOverlayKind,
} from './si-overlay-layout.js';
import {
  buildSiCenterSlideshow,
  buildSiCelebrityCenterSlideshow,
  cleanupSiMultiImageArtifacts,
} from './si-multi-image.js';
// import { getPrebakedNoiseMov } from './si-prebake.js'; // TODO: re-enable SI noise
import type { CaptionStyleKey } from './caption-styles.js';
import { getCaptionStylePreset, resolveCaptionStyleKey } from './caption-styles.js';
import {
  convertSrtToAss,
  escapePathForFfmpegSubtitles,
  resolveJapaneseSubtitleStyle,
  scaleSrtTimestamps,
} from './si-subtitle.js';

export interface AssembleReupSiVideoInput {
  workDir: string;
  audioPath: string;
  subtitlePath: string;
  /** When omitted, assemble stock + subtitles without center image overlay. */
  centerImagePath?: string;
  /** When set (multi_image / celebrity), build Ken Burns slideshow and overlay instead of a static center image. */
  centerImagePaths?: string[];
  /** Slideshow builder: multi_image (default) vs celebrity gentle 60s slides. */
  centerSlideshowVariant?: 'multi' | 'celebrity';
  /** Final mp4 basename without extension (default: video). */
  outputBasename?: string;
  showAudioBar?: boolean;
  audioBarFile?: string;
  showSmallVideo?: boolean;
  smallVideoFile?: string;
  showSubscribe?: boolean;
  subscribeFile?: string;
  channelAvatarPath?: string;
  backgroundFootageMode?: StockBackgroundMode;
  backgroundFootageSourceIds?: string[];
  language: string;
  captionStyleKey?: CaptionStyleKey;
  /** Temporary: burn top-left disclaimer for the first N seconds. */
  showDisclaim?: boolean;
  disclaimerText?: string;
  onLog?: (msg: string) => void;
  onFfmpegProgress?: (progress: FfmpegProgress) => void;
}

export async function assembleReupSiVideo(input: AssembleReupSiVideoInput): Promise<string> {
  const {
    workDir,
    audioPath,
    subtitlePath,
    centerImagePath,
    centerImagePaths,
    centerSlideshowVariant = 'multi',
    outputBasename = SI_OUTPUT_VIDEO_BASENAME,
    showAudioBar = false,
    audioBarFile,
    showSmallVideo = false,
    smallVideoFile,
    showSubscribe = false,
    subscribeFile,
    channelAvatarPath,
    backgroundFootageMode = 'source',
    backgroundFootageSourceIds = [],
    language,
    captionStyleKey,
    showDisclaim = false,
    disclaimerText,
    onLog,
    onFfmpegProgress,
  } = input;
  const log = (msg: string) => {
    console.log(msg);
    onLog?.(msg);
  };

  const multiImagePaths = centerImagePaths?.filter(p => Boolean(p?.trim())) ?? [];
  const useMultiImage = multiImagePaths.length > 0;
  if (useMultiImage && centerImagePath) {
    throw new AppError(
      'SI assembly cannot use both centerImagePath and centerImagePaths',
      400,
      'SI_CENTER_IMAGE_CONFLICT',
    );
  }

  const requiredPaths = [
    audioPath,
    subtitlePath,
    ...(centerImagePath ? [centerImagePath] : []),
    ...multiImagePaths,
    ...(channelAvatarPath ? [channelAvatarPath] : []),
  ];
  for (const requiredPath of requiredPaths) {
    try {
      await fs.access(requiredPath);
    } catch {
      throw new AppError(`SI assembly missing input file: ${requiredPath}`, 400, 'SI_INPUT_MISSING');
    }
  }

  const assets = assertRequiredSiAssets(captionStyleKey);
  const speed = resolveRandomSiAudioSpeed();
  const centerImageSize =
    useMultiImage || centerImagePath ? resolveRandomSiCenterImageSize() : null;
  if (centerImageSize) {
    log(
      `[reup-si] Center image size: ${centerImageSize.width}x${centerImageSize.height} ` +
        `(ratio ${(centerImageSize.width / SI_CANVAS_W).toFixed(3)})`,
    );
  }
  const originalAudioDuration = await getAudioDurationSeconds(audioPath);
  const audioDurationAfterTempo = originalAudioDuration / speed;

  log(
    `[reup-si] Audio ${originalAudioDuration.toFixed(1)}s → ${formatClockDuration(audioDurationAfterTempo)} after atempo ${speed.toFixed(3)}`,
  );
  if (useMultiImage) {
    log(`[reup-si] Assembling with multi-image center slideshow (${multiImagePaths.length} images)`);
  } else if (!centerImagePath) {
    log('[reup-si] Assembling without center image overlay');
  }

  let audioBarPath: string | undefined;
  let audioBarPreKeyed = false;
  if (showAudioBar || audioBarFile?.trim()) {
    const audioBarClip = await resolveSiAudioBarClip(audioBarFile);
    audioBarPath = audioBarClip.path;
    audioBarPreKeyed = audioBarClip.preKeyed;
    log(`[reup-si] Audio bar clip: ${audioBarClip.filename}`);
    if (audioBarPreKeyed) {
      log(`[reup-si] Audio bar using pre-keyed cache (no runtime colorkey)`);
    } else {
      log(
        `[reup-si] Audio bar runtime green-key: ${SI_AUDIO_BAR_COLORKEY} (similarity=${SI_AUDIO_BAR_COLORKEY_SIMILARITY}, blend=${SI_AUDIO_BAR_COLORKEY_BLEND})`,
      );
    }
  }

  let subscribePath: string | undefined;
  let subscribePreKeyed = false;
  if (showSubscribe || subscribeFile?.trim()) {
    const subscribeClip = await resolveSiSubscribeClip(subscribeFile);
    subscribePath = subscribeClip.path;
    subscribePreKeyed = subscribeClip.preKeyed;
    log(`[reup-si] Subscribe clip: ${subscribeClip.filename}`);
    if (subscribePreKeyed) {
      log(`[reup-si] Subscribe using pre-keyed cache (no runtime colorkey)`);
    } else {
      log(
        `[reup-si] Subscribe runtime green-key: ${SI_SUBSCRIBE_COLORKEY} (similarity=${SI_SUBSCRIBE_COLORKEY_SIMILARITY}, blend=${SI_SUBSCRIBE_COLORKEY_BLEND})`,
      );
    }
  }

  let smallVideoPath: string | undefined;
  if (showSmallVideo || smallVideoFile?.trim()) {
    const smallVideoClip = await resolveSiSmallVideoClip(smallVideoFile);
    smallVideoPath = smallVideoClip.path;
    log(`[reup-si] Small video clip: ${smallVideoClip.filename}`);
  }

  if (channelAvatarPath) {
    log(`[reup-si] Channel avatar overlay: ${path.basename(channelAvatarPath)}`);
  }

  const movableKinds: SiMovableOverlayKind[] = [];
  if (audioBarPath) movableKinds.push('audioBar');
  if (subscribePath) movableKinds.push('subscribe');
  if (smallVideoPath) movableKinds.push('smallVideo');
  const overlayLayout = assignSiOverlayLayout({
    hasAvatar: Boolean(channelAvatarPath),
    movable: movableKinds,
  });
  for (const kind of movableKinds) {
    const pos = overlayLayout.positions[kind];
    if (pos) {
      log(
        `[reup-si] Overlay layout ${kind} → ${pos.slot} x=${pos.x} y=${pos.y} ` +
          `(marginX=${pos.edgeMarginX} marginY=${pos.edgeMarginY})`,
      );
    }
  }
  log(`[reup-si] Center image shift: ${overlayLayout.centerImageShift}`);
  if (centerSlideshowVariant === 'celebrity') {
    log('[reup-si] Celebrity center: forcing horizontal shift none (fixed center)');
  }

  let centerSlideshowPath: string | undefined;
  const stockRenderTarget = audioDurationAfterTempo + STOCK_RENDER_EXTRA_SEC;
  const stepOpts = { prefix: '[reup-si]', onLog };
  let stockTempDir: string | undefined;

  const isLocalStock = backgroundFootageMode === 'local';
  let activeSubtitlePath = subtitlePath;
  let scaledSrtPath: string | null = null;
  const outputPath = path.join(workDir, `${outputBasename}.mp4`);
  const filterScriptPath = path.join(workDir, 'filter_complex.txt');
  const tempAssPath = path.join(workDir, 'temp_sub.ass');
  const resizedCenterImagePath = path.join(workDir, 'center_opacity.png');
  const centerSlideshowOpacityPath = path.join(workDir, 'center_slideshow_opacity.mov');
  let mergeArgs: string[] = [];
  let preparedAvatarPath: string | null = null;
  let avatarPrebaked = false;
  let centerOpacityBaked = false;

  try {
  if (useMultiImage) {
    const rawSlideshow =
      centerSlideshowVariant === 'celebrity'
        ? await buildSiCelebrityCenterSlideshow(workDir, multiImagePaths, onLog, centerImageSize!)
        : await buildSiCenterSlideshow(workDir, multiImagePaths, onLog, centerImageSize!);
    log('[reup-si] Baking center slideshow opacity into alpha video');
    await bakeVideoWithOpacity(rawSlideshow, centerSlideshowOpacityPath, SI_CENTER_IMAGE_OPACITY, onLog);
    centerSlideshowPath = centerSlideshowOpacityPath;
    centerOpacityBaked = true;
  }

  const stockPrepared = await prepareStockBackground(
    {
      mode: backgroundFootageMode,
      backgroundFootageSourceIds,
    },
    stockRenderTarget,
    workDir,
    onLog,
    onFfmpegProgress,
  );
  const { stockClipPath } = stockPrepared;
  stockTempDir = stockPrepared.stockTempDir;

  // let prebakedSiNoise: string | null = null; // TODO: re-enable SI noise
  // let siNoiseInputPath = assets.noisePath; // TODO: re-enable SI noise

  await timedStep(
    'Chuẩn bị subtitle',
    async () => {
      if (speed !== 1) {
        scaledSrtPath = path.join(workDir, 'temp_scaled_sub.srt');
        scaleSrtTimestamps(subtitlePath, scaledSrtPath, speed);
        activeSubtitlePath = scaledSrtPath;
      }

      if (centerImagePath) {
        const targetW = centerImageSize!.width;
        log(`[reup-si] Baking center still opacity (${targetW}px, aa=${SI_CENTER_IMAGE_OPACITY})`);
        await bakeStillWithOpacity(
          centerImagePath,
          resizedCenterImagePath,
          targetW,
          SI_CENTER_IMAGE_OPACITY,
          onLog,
        );
        centerOpacityBaked = true;
      }

      if (channelAvatarPath) {
        preparedAvatarPath = await ensurePrebakedChannelAvatar(channelAvatarPath, onLog);
        avatarPrebaked = true;
      }

      // TODO: re-enable SI noise
      // if (!isLocalStock) {
      //   prebakedSiNoise = await getPrebakedNoiseMov(
      //     assets.noisePath,
      //     SI_CANVAS_W,
      //     SI_CANVAS_H,
      //     SI_FPS,
      //     SI_NOISE_ALPHA,
      //   );
      //   siNoiseInputPath = prebakedSiNoise ?? assets.noisePath;
      // }

      mergeArgs = ['-y'];
      let inputIdx = 0;

      mergeArgs.push('-stream_loop', '-1', '-i', stockClipPath);
      const stockIndex = inputIdx++;

      const audioIndex = inputIdx++;
      mergeArgs.push('-i', audioPath);

      let centerImgIndex: number | null = null;
      if (centerSlideshowPath) {
        centerImgIndex = inputIdx++;
        mergeArgs.push('-stream_loop', '-1', '-i', centerSlideshowPath);
      } else if (centerImagePath) {
        centerImgIndex = inputIdx++;
        mergeArgs.push(
          '-f',
          'image2',
          '-loop',
          '1',
          '-framerate',
          String(SI_FPS),
          '-i',
          resizedCenterImagePath,
        );
      }

      let audioBarIndex: number | null = null;
      if (audioBarPath) {
        audioBarIndex = inputIdx++;
        mergeArgs.push('-stream_loop', '-1', '-i', audioBarPath);
      }

      let subscribeIndex: number | null = null;
      if (subscribePath) {
        subscribeIndex = inputIdx++;
        mergeArgs.push('-stream_loop', '-1', '-i', subscribePath);
      }

      let smallVideoIndex: number | null = null;
      if (smallVideoPath) {
        smallVideoIndex = inputIdx++;
        mergeArgs.push('-stream_loop', '-1', '-i', smallVideoPath);
      }

      let channelAvatarIndex: number | null = null;
      if (preparedAvatarPath) {
        channelAvatarIndex = inputIdx++;
        mergeArgs.push(
          '-f',
          'image2',
          '-loop',
          '1',
          '-framerate',
          String(SI_FPS),
          '-i',
          preparedAvatarPath,
        );
      }

      // TODO: re-enable SI noise
      // let siNoiseIndex: number | null = null;
      // if (!isLocalStock) {
      //   siNoiseIndex = inputIdx++;
      //   mergeArgs.push('-stream_loop', '-1', '-i', siNoiseInputPath);
      // }

      const filterParts: string[] = [];
      filterParts.push(`[${audioIndex}:a]atempo=${speed}[aout]`);

      const vBgLabel = 'vout_bg';
      if (isLocalStock) {
        filterParts.push(localStockNormalizeFilterChain(`${stockIndex}:v`, vBgLabel, log));
      } else {
        filterParts.push(stockNormalizeFilterChain(`${stockIndex}:v`, vBgLabel, 1.0, false));
      }

      let currentVLabel = vBgLabel;

      if (!isLocalStock) {
        filterParts.push(`[${currentVLabel}]lutyuv=y='val*${STOCK_DIM_FACTOR}':u='val':v='val'[v_dimmed]`);
        currentVLabel = 'v_dimmed';
      }

      if (centerImgIndex !== null) {
        const centerImageOverlayX = resolveSiCenterImageOverlayX(
          centerSlideshowVariant === 'celebrity' ? 'none' : overlayLayout.centerImageShift,
        );
        if (centerOpacityBaked) {
          // Opacity already baked into PNG/MOV alpha — cheap overlay only.
          filterParts.push(`[${centerImgIndex}:v]format=rgba[center_img]`);
        } else {
          const targetW = centerImageSize!.width;
          filterParts.push(
            `[${centerImgIndex}:v]fps=${SI_FPS},scale=${targetW}:-1,format=rgba,colorchannelmixer=aa=${SI_CENTER_IMAGE_OPACITY}[center_img]`,
          );
        }
        filterParts.push(
          `[${currentVLabel}][center_img]overlay=${centerImageOverlayX}:${SI_CENTER_IMAGE_MARGIN_TOP_PX}:format=auto:shortest=1[v_centered_img]`,
        );
        currentVLabel = 'v_centered_img';
      }

      if (subscribeIndex !== null && overlayLayout.positions.subscribe) {
        const pos = overlayLayout.positions.subscribe;
        if (subscribePreKeyed) {
          // Cache is already sized + keyed
          filterParts.push(`[${subscribeIndex}:v]format=rgba[subscribe_scaled]`);
          filterParts.push(
            `[${currentVLabel}][subscribe_scaled]overlay=${pos.x}:${pos.y}:shortest=1:format=auto[v_subscribe]`,
          );
        } else {
          appendSiSmallVideoScaleFilters(filterParts, `${subscribeIndex}:v`, 'subscribe_scaled');
          filterParts.push(
            `[subscribe_scaled]colorkey=${SI_SUBSCRIBE_COLORKEY}:${SI_SUBSCRIBE_COLORKEY_SIMILARITY}:${SI_SUBSCRIBE_COLORKEY_BLEND}[subscribe_keyed]`,
          );
          filterParts.push(
            `[${currentVLabel}][subscribe_keyed]overlay=${pos.x}:${pos.y}:shortest=1:format=auto[v_subscribe]`,
          );
        }
        currentVLabel = 'v_subscribe';
      }

      if (smallVideoIndex !== null && overlayLayout.positions.smallVideo) {
        const pos = overlayLayout.positions.smallVideo;
        appendSiSmallVideoScaleFilters(filterParts, `${smallVideoIndex}:v`, 'small_video_scaled');
        filterParts.push(
          `[${currentVLabel}][small_video_scaled]overlay=${pos.x}:${pos.y}:shortest=1[v_small]`,
        );
        currentVLabel = 'v_small';
      }

      if (audioBarIndex !== null && overlayLayout.positions.audioBar) {
        const pos = overlayLayout.positions.audioBar;
        appendSiAudioBarScaleFilters(filterParts, `${audioBarIndex}:v`, 'audio_bar_scaled', {
          preKeyed: audioBarPreKeyed,
        });
        filterParts.push(
          `[${currentVLabel}][audio_bar_scaled]overlay=${pos.x}:${pos.y}:shortest=1:format=auto[v_audio_bar]`,
        );
        currentVLabel = 'v_audio_bar';
      }

      if (channelAvatarIndex !== null) {
        appendChannelAvatarOverlayFilters(
          filterParts,
          currentVLabel,
          `${channelAvatarIndex}:v`,
          'v_channel_avatar',
          { prebaked: avatarPrebaked },
        );
        currentVLabel = 'v_channel_avatar';
      }

      // TODO: re-enable SI noise
      // if (!isLocalStock && siNoiseIndex !== null) {
      //   if (prebakedSiNoise) {
      //     filterParts.push(`[${siNoiseIndex}:v]null[si_noise]`);
      //   } else {
      //     filterParts.push(
      //       `[${siNoiseIndex}:v]fps=${SI_FPS},scale=${SI_CANVAS_W}:${SI_CANVAS_H}:flags=fast_bilinear,format=yuva420p,colorkey=0x000000:0.1:0.1,colorchannelmixer=aa=${SI_NOISE_ALPHA}[si_noise]`,
      //     );
      //   }
      //   filterParts.push(`[${currentVLabel}][si_noise]overlay=0:0:shortest=1[v_si_noised]`);
      //   currentVLabel = 'v_si_noised';
      // }

      const useJaSubtitleStyle = resolveJapaneseSubtitleStyle(activeSubtitlePath, language);
      const resolvedCaptionStyleKey = resolveCaptionStyleKey(captionStyleKey);
      convertSrtToAss(activeSubtitlePath, tempAssPath, {
        captionStyleKey: resolvedCaptionStyleKey,
        japaneseStyle: useJaSubtitleStyle,
        fontFile: assets.fontPath,
        showDisclaim,
        disclaimerText,
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
            const subtitleBoxHeight = Math.floor(SI_CANVAS_H / 3);
            const boxY = SI_CANVAS_H - subtitleBoxHeight - SI_SUBTITLE_MARGIN_BOTTOM_PX;
            const drawboxFilter = `drawbox=x=0:y=${boxY}:w=iw:h=${subtitleBoxHeight}:color=black@${SI_SUBTITLE_BOX_OPACITY}:t=fill`;
            return `${drawboxFilter},${subFilter}`;
          })()
        : subFilter;
      filterParts.push(`[${currentVLabel}]${videoFilters}${finalFormat}[${videoMapLabel}]`);

      const fullGraph = filterParts.join(';');
      await fs.writeFile(filterScriptPath, fullGraph, 'utf-8');

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
        String(audioDurationAfterTempo),
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
        expectedDurationSec: audioDurationAfterTempo,
        label: 'si-final-merge',
      }),
    stepOpts,
  );
  } finally {
    await fs.unlink(filterScriptPath).catch(() => undefined);
    await fs.unlink(tempAssPath).catch(() => undefined);
    if (centerImagePath) {
      await fs.unlink(resizedCenterImagePath).catch(() => undefined);
    }
    if (useMultiImage) {
      await fs.unlink(centerSlideshowOpacityPath).catch(() => undefined);
      await cleanupSiMultiImageArtifacts(workDir);
    }
    if (scaledSrtPath) {
      await fs.unlink(scaledSrtPath).catch(() => undefined);
    }
    if (stockTempDir) {
      await cleanupStockTempDir(stockTempDir);
    }
  }

  log(`[reup-si] Video saved → ${outputPath}`);
  return outputPath;
}
