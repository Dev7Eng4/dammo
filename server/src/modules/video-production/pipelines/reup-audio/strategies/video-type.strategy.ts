import type { ReupAudioVideoType } from '../../../../youtube-channels/youtube-channels.types.js';
import type { AiVideoScenePrompt } from '../../../shared/ai-video/ai-video.types.js';
import type { ThumbnailFlow } from '../steps/thumbnail.step.js';
import type { AssembleContext, VideoTaskContext } from '../video-task.context.js';

/** Visual inputs produced before assembly, accumulated across steps. */
export interface VisualAssets {
  /** Static center/background image for SI `one_image`. */
  heroImagePath?: string;
  reupThumbnailPath?: string;
  aiScenePrompts?: AiVideoScenePrompt[];
  aiScenePromptsPath?: string;
  aiSlidesDir?: string;
}

export type AssembleReadiness = { ready: true } | { ready: false; reason: string };

export interface VideoTypeStrategy {
  readonly type: ReupAudioVideoType;

  /**
   * Some flows generate the thumbnail and the background in a single image-tool
   * batch, so they cannot be split across steps. Return `null` to let the
   * thumbnail step run its normal branch.
   */
  tryCombinedThumbnailBatch(
    ctx: VideoTaskContext,
    imageGenerationPrompt: string,
  ): Promise<Pick<VisualAssets, 'reupThumbnailPath' | 'heroImagePath'> | null>;

  /**
   * Background image still missing after the thumbnail step. Runs only for
   * channels that go through LLM enrichment, since it depends on metadata.
   */
  prepareEnrichedVisuals(
    ctx: VideoTaskContext,
    assets: VisualAssets,
    thumbnailFlow: ThumbnailFlow,
  ): Promise<Partial<VisualAssets>>;

  /** Scene prompts + scene images. Runs for every channel, enriched or not. */
  prepareSceneAssets(ctx: VideoTaskContext): Promise<Partial<VisualAssets>>;

  /**
   * Non-throwing precondition check so callers can skip assembly with a reason.
   * Called immediately before {@link assemble} and may materialise input files
   * (e.g. copying celebrity images into `images/`) as a side effect.
   */
  canAssemble(ctx: AssembleContext, assets: VisualAssets): Promise<AssembleReadiness>;

  /** Returns the absolute path of the assembled mp4. */
  assemble(ctx: AssembleContext, assets: VisualAssets): Promise<string>;
}
