import { moveYoutubeChannelVideoToUploads } from '../../config/paths.js';
import { videoPrepareRepository } from '../youtube-channels/video-prepare.repository.js';
import { youtubeChannelsRepository } from '../youtube-channels/youtube-channels.repository.js';
import type { PublishScheduleSlot } from './publish-schedule.js';

export interface SyncAfterUploadParams {
  channelId: string;
  videoId: string;
  folderPath?: string;
  latestScheduleSlot?: PublishScheduleSlot | null;
}

export async function syncAfterYoutubeUpload(params: SyncAfterUploadParams): Promise<void> {
  const videoId = params.videoId.trim();
  if (!videoId) return;

  const updated = videoPrepareRepository.markUploaded(params.channelId, videoId);
  if (!updated) {
    console.warn(`[youtube-upload] video-prepare: no item for videoId «${videoId}»`);
  }

  const uploadedAt = params.latestScheduleSlot?.iso ?? new Date().toISOString();

  youtubeChannelsRepository.update(params.channelId, channel => ({
    ...channel,
    lastUploadAt: uploadedAt,
  }));

  moveYoutubeChannelVideoToUploads(params.channelId, videoId, params.folderPath);
}
