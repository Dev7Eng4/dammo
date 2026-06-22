import { youtubeChannelVideoDir } from '../../../config/paths.js';
import { AppError } from '../../../shared/http/errors.js';
import type { StoredYoutubeChannelType, YoutubeChannel } from '../../youtube-channels/youtube-channels.types.js';
import { videoPrepareRepository } from '../../youtube-channels/video-prepare.repository.js';
import type { VideoPrepareItem } from '../../youtube-channels/video-prepare.types.js';
import type { ProductionDestination, ProductionPipelineType } from '../ports/production-destination.port.js';

function isReupPipelineType(type: StoredYoutubeChannelType): type is ProductionPipelineType {
  return type === 'reup_audio' || type === 'reup_video' || type === 'reup';
}

export function createYoutubeProductionDestination(channel: YoutubeChannel): ProductionDestination {
  if (!isReupPipelineType(channel.type)) {
    throw new AppError('Channel type does not support video production', 400, 'INVALID_CHANNEL_TYPE');
  }

  return {
    id: channel.id,
    name: channel.name,
    pipelineType: channel.type,
    language: channel.language,
    sourceMapping: channel.sourceMapping,
    backgroundFootageSourceId: channel.backgroundFootageSourceId,
    thumbnailStyleKey: channel.thumbnailStyleKey,

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
