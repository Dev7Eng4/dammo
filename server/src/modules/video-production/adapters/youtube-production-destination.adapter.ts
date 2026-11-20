import { youtubeChannelVideoDir } from '../../../config/paths.js';
import { AppError } from '../../../shared/http/errors.js';
import { resolveReupAudioVisualStyle } from '../../youtube-channels/reup-audio-visual-style.js';
import { isAiSceneVideoType, isReupAudioFamilyType } from '../../youtube-channels/youtube-channels.types.js';
import type {
  ReupAudioBackgroundImage,
  StoredYoutubeChannelType,
  YoutubeChannel,
} from '../../youtube-channels/youtube-channels.types.js';
import { videoPrepareRepository } from '../../youtube-channels/video-prepare.repository.js';
import type { VideoPrepareItem } from '../../youtube-channels/video-prepare.types.js';
import type { ProductionDestination, ProductionPipelineType } from '../ports/production-destination.port.js';
import { parseMascotCandidateCountFromStyleKey } from '../../prompts/thumbnail-styles.js';

/** Pipeline a channel type is produced with; `remake_video` channels run the Reup audio pipeline. */
function toPipelineType(type: StoredYoutubeChannelType): ProductionPipelineType | null {
  if (isReupAudioFamilyType(type)) return 'reup_audio';
  return type === 'reup_video' || type === 'reup' ? type : null;
}

function resolveSiBackgroundImage(channel: YoutubeChannel): ReupAudioBackgroundImage {
  return channel.reupAudioBackgroundImage ?? 'one_image';
}

async function resolveReupAudioConfig(channel: YoutubeChannel) {
  if (!isReupAudioFamilyType(channel.type)) {
    return {};
  }

  if (!channel.reupAudioVideoType) {
    throw new AppError(
      'Reup Audio channel is missing reupAudioVideoType (si or ai)',
      400,
      'VALIDATION_ERROR',
    );
  }

  const siBackgroundImage =
    channel.reupAudioVideoType === 'si' ? resolveSiBackgroundImage(channel) : undefined;
  const requiresVisualStyle =
    isAiSceneVideoType(channel.reupAudioVideoType) ||
    siBackgroundImage === 'multi_image' ||
    channel.useReferenceImage === true;

  if (requiresVisualStyle && !channel.reupAudioVisualStyleId?.trim()) {
    throw new AppError(
      'Reup Audio channel is missing reupAudioVisualStyleId',
      400,
      'VALIDATION_ERROR',
    );
  }

  const visualStyle = channel.reupAudioVisualStyleId?.trim()
    ? await resolveReupAudioVisualStyle(channel)
    : undefined;

  return {
    reupAudioVideoType: channel.reupAudioVideoType,
    ...(channel.reupAudioVideoType === 'si' || isAiSceneVideoType(channel.reupAudioVideoType)
      ? {
          showSmallVideo: channel.showSmallVideo === true || Boolean(channel.smallVideoFile?.trim()),
          ...(channel.smallVideoFile?.trim() ? { smallVideoFile: channel.smallVideoFile.trim() } : {}),
        }
      : {}),
    ...(channel.reupAudioVideoType === 'si'
      ? {
          reupAudioBackgroundImage: siBackgroundImage!,
          showAudioBar: channel.showAudioBar === true || Boolean(channel.audioBarFile?.trim()),
          ...(channel.audioBarFile?.trim() ? { audioBarFile: channel.audioBarFile.trim() } : {}),
          showSubscribe: channel.showSubscribe === true || Boolean(channel.subscribeFile?.trim()),
          ...(channel.subscribeFile?.trim() ? { subscribeFile: channel.subscribeFile.trim() } : {}),
        }
      : {}),
    ...(channel.celebrityId?.trim() ? { celebrityId: channel.celebrityId.trim() } : {}),
    ...(channel.reupAudioVisualStyleId?.trim()
      ? { reupAudioVisualStyleId: channel.reupAudioVisualStyleId.trim() }
      : {}),
    ...(channel.aiSceneDensityMaxSec ? { aiSceneDensityMaxSec: channel.aiSceneDensityMaxSec } : {}),
    ...(channel.useReferenceImage === true ? { useReferenceImage: true } : {}),
    ...(visualStyle ? { visualStyle } : {}),
  };
}

export async function createYoutubeProductionDestination(
  channel: YoutubeChannel,
): Promise<ProductionDestination> {
  const pipelineType = toPipelineType(channel.type);
  if (!pipelineType) {
    throw new AppError('Channel type does not support video production', 400, 'INVALID_CHANNEL_TYPE');
  }

  const reupAudioConfig = await resolveReupAudioConfig(channel);

  return {
    id: channel.id,
    name: channel.name,
    pipelineType,
    language: channel.language,
    niche: channel.niche?.trim() || 'all',
    sourceChannels: channel.sourceChannels ?? [],
    ...(channel.sourceMode === 'trend_brain'
      ? { sourceMode: 'trend_brain' as const, trendClusters: channel.trendClusters ?? [] }
      : {}),
    ...(channel.videoCreationOrder ? { videoCreationOrder: channel.videoCreationOrder } : {}),
    backgroundFootageSources: channel.backgroundFootageSources,
    thumbnailStyleKey: channel.thumbnailStyleKey,
    ...(channel.mascotThumbnailCandidates
      ? { mascotThumbnailCandidates: channel.mascotThumbnailCandidates }
      : {}),
    ...(channel.thumbnailBackgroundFile?.trim()
      ? { thumbnailBackgroundFile: channel.thumbnailBackgroundFile.trim() }
      : {}),
    captionStyleKey: channel.captionStyleKey,
    // Remake channels remake the script and narrate it unless switched off on the channel.
    ...(channel.type === 'remake_video' && channel.remakeAuto?.enabled !== false
      ? { remakeAuto: channel.remakeAuto ?? {} }
      : {}),
    showDisclaimer: channel.showDisclaimer === true,
    ...(channel.showChannelAvatar === true ? { showChannelAvatar: true } : {}),
    disclaimerText: channel.disclaimerText,
    descriptionDisclaimerText: channel.descriptionDisclaimerText,
    ...reupAudioConfig,

    getVideoOutputDir(mediaId: string) {
      return youtubeChannelVideoDir(channel.id, mediaId);
    },

    getPreparedVideoIds() {
      return videoPrepareRepository.getPreparedVideoIds(channel.id);
    },

    trackPreparedVideo(item: VideoPrepareItem) {
      videoPrepareRepository.appendCreated(channel.id, item);
    },

    ensurePrepareStore() {
      videoPrepareRepository.ensureStore(channel.id);
    },
  };
}
