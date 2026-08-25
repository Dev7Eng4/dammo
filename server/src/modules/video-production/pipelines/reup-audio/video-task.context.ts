import type { TimedStepOptions } from '../../../../shared/timing/step-timer.js';
import type { ReupAudioVideoType } from '../../../youtube-channels/youtube-channels.types.js';
import type { ReupAudioDownloadResult } from '../../shared/assets/asset-downloader.js';
import type { VideoMetaOutput } from '../../shared/meta/metadata.types.js';
import type { ProductionDestination } from '../../ports/production-destination.port.js';
import type { TaskLogger } from './task-logger.js';
import type { ReupVideoTask } from './reup-audio.types.js';

export type StepTimerOptions = Pick<TimedStepOptions, 'prefix' | 'onLog'>;

/**
 * Everything the assemble stage needs, and nothing more. Kept separate from
 * {@link VideoTaskContext} so CLI scripts can rebuild it from an existing video
 * folder without replaying the download/metadata steps.
 */
export interface AssembleContext {
  destination: ProductionDestination;
  videoType: ReupAudioVideoType;
  workDir: string;
  audioPath: string;
  subtitlePath: string;
  /** Final mp4 basename without extension. */
  outputBasename: string;
  channelAvatarPath?: string;
  showDisclaim: boolean;
  disclaimerText?: string;
  log: TaskLogger;
  stepTimer: StepTimerOptions;
  /** Called once the long ffmpeg render is about to start. */
  beginRenderPhase?: () => void;
}

/** Full per-video context threaded through every pipeline step. */
export interface VideoTaskContext {
  destination: ProductionDestination;
  videoType: ReupAudioVideoType;
  task: ReupVideoTask;
  taskJobId?: string;
  log: TaskLogger;
  stepTimer: StepTimerOptions;
  /** Folder holding audio, transcript, images and the assembled mp4. */
  workDir: string;
  downloaded: ReupAudioDownloadResult;
  /** SRT handed to the assembler (LLM-updated when the channel is Japanese). */
  subtitlePath: string;
  videoMeta?: VideoMetaOutput;
}

/** Plain ffmpeg/log sink derived from the structured logger. */
export function toOnLog(log: TaskLogger): ((msg: string) => void) | undefined {
  return log.enabled ? msg => log.info(msg) : undefined;
}

export function buildAssembleContext(
  ctx: VideoTaskContext,
  options: { outputBasename: string; channelAvatarPath?: string; beginRenderPhase?: () => void },
): AssembleContext {
  const disclaimerText = ctx.destination.disclaimerText?.trim();

  return {
    destination: ctx.destination,
    videoType: ctx.videoType,
    workDir: ctx.workDir,
    audioPath: ctx.downloaded.audioPath,
    subtitlePath: ctx.subtitlePath,
    outputBasename: options.outputBasename,
    ...(options.channelAvatarPath ? { channelAvatarPath: options.channelAvatarPath } : {}),
    showDisclaim: ctx.destination.showDisclaimer === true && Boolean(disclaimerText),
    ...(disclaimerText ? { disclaimerText } : {}),
    log: ctx.log,
    stepTimer: ctx.stepTimer,
    ...(options.beginRenderPhase ? { beginRenderPhase: options.beginRenderPhase } : {}),
  };
}
