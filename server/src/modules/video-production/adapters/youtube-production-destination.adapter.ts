import { youtubeChannelVideoDir } from '../../../config/paths.js';
import { AppError } from '../../../shared/http/errors.js';
import type { StoredYoutubeChannelType, YoutubeChannel } from '../../youtube-channels/youtube-channels.types.js';
import { videoPrepareRepository } from '../../youtube-channels/video-prepare.repository.js';
import type { VideoPrepareItem } from '../../youtube-channels/video-prepare.types.js';
import { visualStylesService } from '../../visual-styles/visual-styles.service.js';
import type { ProductionDestination, ProductionPipelineType } from '../ports/production-destination.port.js';

function isReupPipelineType(type: StoredYoutubeChannelType): type is ProductionPipelineType {
  return type === 'reup_audio' || type === 'reup_video' || type === 'reup';
}

function resolveReupAudioConfig(channel: YoutubeChannel) {
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

  if (!channel.reupAudioVisualStyleId?.trim()) {
    throw new AppError(
      'Reup Audio channel is missing reupAudioVisualStyleId',
      400,
      'VALIDATION_ERROR',
    );
  }

  const visualStyle = visualStylesService.getById(channel.reupAudioVisualStyleId.trim());

  return {
    reupAudioVideoType: channel.reupAudioVideoType,
    reupAudioVisualStyleId: channel.reupAudioVisualStyleId.trim(),
    visualStyle: {
      id: visualStyle.id,
      name: visualStyle.name,
      rule: visualStyle.rule,
      niche: visualStyle.niche,
    },
  };
}

export function createYoutubeProductionDestination(channel: YoutubeChannel): ProductionDestination {
  if (!isReupPipelineType(channel.type)) {
    throw new AppError('Channel type does not support video production', 400, 'INVALID_CHANNEL_TYPE');
  }

  const reupAudioConfig = resolveReupAudioConfig(channel);

  return {
    id: channel.id,
    name: channel.name,
    pipelineType: channel.type,
    language: channel.language,
    sourceChannels: channel.sourceChannels ?? [],
    backgroundFootageSources: channel.backgroundFootageSources,
    thumbnailStyleKey: channel.thumbnailStyleKey,
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
