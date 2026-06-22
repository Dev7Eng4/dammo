import { videoPrepareRepository } from '../youtube-channels/video-prepare.repository.js';
import { youtubeChannelsRepository } from '../youtube-channels/youtube-channels.repository.js';
import type { PublishScheduleSlot } from './publish-schedule.js';

export interface SyncAfterUploadParams {
  channelId: string;
  videoId: string;
  latestScheduleSlot?: PublishScheduleSlot | null;
}

function formatActivityTime(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '--:--';
  return date.toISOString().slice(11, 16);
}

export async function syncAfterYoutubeUpload(params: SyncAfterUploadParams): Promise<void> {
  const videoId = params.videoId.trim();
  if (!videoId) return;

  const updated = videoPrepareRepository.markUploaded(params.channelId, videoId);
  if (!updated) {
    console.warn(`[youtube-upload] video-prepare: no item for videoId «${videoId}»`);
  }

  const uploadedAt = params.latestScheduleSlot?.iso ?? new Date().toISOString();
  const activityMessage = `Uploaded video ${videoId}`;

  youtubeChannelsRepository.update(params.channelId, channel => ({
    ...channel,
    lastUploadAt: uploadedAt,
    recentActivity: [
      { at: formatActivityTime(uploadedAt), message: activityMessage },
      ...channel.recentActivity,
    ].slice(0, 20),
  }));
}
