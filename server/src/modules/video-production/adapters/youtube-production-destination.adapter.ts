import { youtubeChannelVideoDir } from '../../../config/paths.js';
import { AppError } from '../../../shared/http/errors.js';
import { resolveReupAudioVisualStyle } from '../../youtube-channels/reup-audio-visual-style.js';
import type {
  ReupAudioBackgroundImage,
  StoredYoutubeChannelType,
  YoutubeChannel,
} from '../../youtube-channels/youtube-channels.types.js';
import { videoPrepareRepository } from '../../youtube-channels/video-prepare.repository.js';
import type { VideoPrepareItem } from '../../youtube-channels/video-prepare.types.js';
import type { ProductionDestination, ProductionPipelineType } from '../ports/production-destination.port.js';

function isReupPipelineType(type: StoredYoutubeChannelType): type is ProductionPipelineType {
  return type === 'reup_audio' || type === 'reup_video' || type === 'reup';
}

function resolveSiBackgroundImage(channel: YoutubeChannel): ReupAudioBackgroundImage {
  return channel.reupAudioBackgroundImage ?? 'one_image';
}

async function resolveReupAudioConfig(channel: YoutubeChannel) {
  if (channel.type !== 'reup_audio') {
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
    channel.reupAudioVideoType === 'ai' ||
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
    ...(channel.reupAudioVideoType === 'si'
      ? {
          reupAudioBackgroundImage: siBackgroundImage!,
          showAudioBar: channel.showAudioBar === true || Boolean(channel.audioBarFile?.trim()),
          ...(channel.audioBarFile?.trim() ? { audioBarFile: channel.audioBarFile.trim() } : {}),
          showSmallVideo: channel.showSmallVideo === true || Boolean(channel.smallVideoFile?.trim()),
          ...(channel.smallVideoFile?.trim() ? { smallVideoFile: channel.smallVideoFile.trim() } : {}),
          showSubscribe: channel.showSubscribe === true || Boolean(channel.subscribeFile?.trim()),
          ...(channel.subscribeFile?.trim() ? { subscribeFile: channel.subscribeFile.trim() } : {}),
        }
      : {}),
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
  if (!isReupPipelineType(channel.type)) {
    throw new AppError('Channel type does not support video production', 400, 'INVALID_CHANNEL_TYPE');
  }

  const reupAudioConfig = await resolveReupAudioConfig(channel);

  return {
    id: channel.id,
    name: channel.name,
    pipelineType: channel.type,
    language: channel.language,
    sourceChannels: channel.sourceChannels ?? [],
    backgroundFootageSources: channel.backgroundFootageSources,
    backgroundFootageMode: channel.backgroundFootageMode,
    thumbnailStyleKey: channel.thumbnailStyleKey,
    ...(channel.thumbnailBackgroundFile?.trim()
      ? { thumbnailBackgroundFile: channel.thumbnailBackgroundFile.trim() }
      : {}),
    captionStyleKey: channel.captionStyleKey,
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
