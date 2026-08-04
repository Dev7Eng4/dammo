import path from 'node:path';
import { AppError } from '../../shared/http/errors.js';
import {
  connectPlaywrightToGpmProfile,
  disconnectGpmPlaywright,
  resolveGpmProfileIdByEmail,
  scheduleDelayedGpmDisconnect,
  type GpmPlaywrightConnection,
} from '../../infrastructure/gpm/gpm-playwright.connector.js';
import { moveYoutubeChannelVideoToUploads } from '../../config/paths.js';
import { youtubeChannelsRepository } from '../youtube-channels/youtube-channels.repository.js';
import { videoPrepareRepository } from '../youtube-channels/video-prepare.repository.js';
import { syncAfterYoutubeUpload } from './upload-after-sync.js';
import { getNextYoutubePublishSlot, getYoutubePublishPlan, scheduleSlotToUnixMs } from './publish-schedule.js';
import { listUploadJobs, type UploadJob } from './upload-jobs.js';
import {
  addRelatedVideo,
  chooseVisibility,
  fillVideoDetails,
  openYoutubeUpload,
  selectFile,
} from './studio-upload-flow.js';
import { delay } from './studio-dom.js';
import type { StoredYoutubeChannelType } from '../youtube-channels/youtube-channels.types.js';

export interface UploadYoutubeChannelOptions {
  maxUploads?: number | null;
  videoIds?: string[] | null;
}

export interface UploadYoutubeChannelResult {
  ok: boolean;
  channelId: string;
  uploaded: number;
  uploadedSuccessful: number;
  jobs: Array<{ videoId: string; file: string }>;
  successfulVideoIds: string[];
}

interface UploadQueueItem {
  job: UploadJob;
  slot: { date: string; time: string; iso: string } | null;
}

function buildUploadQueue(jobs: UploadJob[], schedule: ReturnType<typeof getYoutubePublishPlan>['schedule']): UploadQueueItem[] {
  const pairs = jobs.map((job, idx) => ({
    job,
    slot: schedule[idx] ?? null,
  }));

  if (schedule.length !== jobs.length) return pairs;
  return [...pairs].sort((a, b) => scheduleSlotToUnixMs(a.slot) - scheduleSlotToUnixMs(b.slot));
}

function isReupUploadChannelType(type: StoredYoutubeChannelType): boolean {
  return type === 'reup_audio' || type === 'reup_video' || type === 'reup';
}

export class YoutubeUploadService {
  async uploadChannel(channelId: string, options: UploadYoutubeChannelOptions = {}): Promise<UploadYoutubeChannelResult> {
    const channel = youtubeChannelsRepository.findById(channelId);
    if (!channel) {
      throw new AppError('Channel not found', 404, 'NOT_FOUND');
    }

    if (!isReupUploadChannelType(channel.type)) {
      throw new AppError('Upload is only supported for reup channels', 400, 'NOT_REUP_CHANNEL');
    }

    if (channel.status !== 'active') {
      throw new AppError('Channel is not active', 400, 'CHANNEL_INACTIVE');
    }

    const email = channel.linkedEmail?.trim();
    if (!email) {
      throw new AppError('Channel linkedEmail is required for GPM upload', 400, 'MISSING_EMAIL');
    }

    const jobs = listUploadJobs(channelId, {
      maxUploads: options.maxUploads,
      videoIds: options.videoIds,
      allowOldThumbnail: !channel.thumbnailStyleKey?.trim(),
    });

    if (jobs.length === 0) {
      throw new AppError(
        'No upload-ready videos (status Created with an .mp4 file, an eligible thumbnail, and title in video-meta.json)',
        400,
        'NO_UPLOAD_JOBS',
      );
    }

    const gpmProfileId = await resolveGpmProfileIdByEmail(email);
    const { schedule } = getYoutubePublishPlan(channel, jobs.length);
    const uploadQueue = buildUploadQueue(jobs, schedule);

    let connection: GpmPlaywrightConnection | undefined;
    let delayBeforeGpmClose = false;
    const successfulVideoIds: string[] = [];

    const logError = (message: string) => {
      console.error(`[youtube-upload] ${channel.name} (${email}) — ${message}`);
    };

    try {
      connection = await connectPlaywrightToGpmProfile(gpmProfileId);
      let page = connection.page;

      for (let i = 0; i < uploadQueue.length; i += 1) {
        const { job, slot } = uploadQueue[i];
        console.log(
          `[youtube-upload] (${i + 1}/${uploadQueue.length}) ${job.videoId} → ${path.basename(job.mp4Path)} (slot: ${slot?.date ?? '—'} ${slot?.time ?? ''})`,
        );

        try {
          if (i === 0) {
            await openYoutubeUpload(page, job.mp4Path);
          } else {
            await selectFile(page, job.mp4Path);
          }

          await fillVideoDetails(page, job.folderPath, logError, job.thumbnailPath);
          await addRelatedVideo(page, job.mp4Path, logError);
          await chooseVisibility(page, { slot });
          successfulVideoIds.push(job.videoId);

          const latestSlot =
            slot && String(slot.date).trim() && String(slot.time).trim() ? slot : null;

          try {
            await syncAfterYoutubeUpload({
              channelId,
              videoId: job.videoId,
              folderPath: job.folderPath,
              latestScheduleSlot: latestSlot,
            });
          } catch (syncErr) {
            const message = syncErr instanceof Error ? syncErr.message : String(syncErr);
            console.warn('[youtube-upload] syncAfterYoutubeUpload:', message);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logError(`Stopped batch — error on video ${i + 1}/${uploadQueue.length} (${job.videoId}): ${message}`);
          break;
        }

        if (i < uploadQueue.length - 1) {
          await delay(2500, 4000);
        }
      }

      delayBeforeGpmClose = successfulVideoIds.length > 0;

      return {
        ok: true,
        channelId,
        uploaded: jobs.length,
        uploadedSuccessful: successfulVideoIds.length,
        jobs: jobs.map(job => ({ videoId: job.videoId, file: path.basename(job.mp4Path) })),
        successfulVideoIds,
      };
    } finally {
      if (connection) {
        if (delayBeforeGpmClose) {
          scheduleDelayedGpmDisconnect(connection);
        } else {
          await disconnectGpmPlaywright(connection);
        }
      }
    }
  }

  async uploadChannels(channelIds: string[], options: UploadYoutubeChannelOptions = {}) {
    const results: Array<{
      channelId: string;
      ok: boolean;
      skipped?: boolean;
      result?: UploadYoutubeChannelResult;
      error?: string;
    }> = [];

    const skipCodes = new Set(['NO_UPLOAD_JOBS', 'NOT_REUP_CHANNEL']);

    for (const channelId of channelIds) {
      try {
        const result = await this.uploadChannel(channelId, options);
        results.push({ channelId, ok: true, result });
      } catch (err) {
        if (err instanceof AppError && skipCodes.has(err.code ?? '')) {
          results.push({
            channelId,
            ok: true,
            skipped: true,
            result: {
              ok: true,
              channelId,
              uploaded: 0,
              uploadedSuccessful: 0,
              jobs: [],
              successfulVideoIds: [],
            },
          });
          continue;
        }

        const message = err instanceof AppError ? err.message : err instanceof Error ? err.message : 'Upload failed';
        results.push({ channelId, ok: false, error: message });
      }
    }

    return { results };
  }

  async markAsUploaded(channelId: string, videoId: string): Promise<{
    videoId: string;
    status: 'Uploaded';
    lastUploadAt: string;
  }> {
    const channel = youtubeChannelsRepository.findById(channelId);
    if (!channel) {
      throw new AppError('Channel not found', 404, 'NOT_FOUND');
    }

    const normalizedVideoId = videoId.trim();
    if (!normalizedVideoId) {
      throw new AppError('Video ID is required', 400, 'INVALID_VIDEO_ID');
    }

    const prepareItem = videoPrepareRepository
      .read(channelId)
      .find(item => item.videoId.trim() === normalizedVideoId);

    if (!prepareItem) {
      throw new AppError('Video prepare item not found', 404, 'VIDEO_PREPARE_NOT_FOUND');
    }

    if (prepareItem.status === 'Uploaded') {
      throw new AppError('Video is already marked as uploaded', 400, 'ALREADY_UPLOADED');
    }

    const nextSlot = getNextYoutubePublishSlot(channel);
    const lastUploadAt = nextSlot?.iso ?? new Date().toISOString();

    const moved = await moveYoutubeChannelVideoToUploads(channelId, normalizedVideoId);
    if (!moved) {
      throw new AppError(
        'Không thể chuyển folder video vào uploads (file có thể đang được mở). Hãy đóng video/preview rồi thử lại.',
        409,
        'MOVE_TO_UPLOADS_FAILED',
      );
    }

    videoPrepareRepository.markUploaded(channelId, normalizedVideoId);

    const updatedChannel = youtubeChannelsRepository.update(channelId, current => ({
      ...current,
      lastUploadAt,
    }));
    if (!updatedChannel) {
      throw new AppError('Failed to update channel lastUploadAt', 500, 'CHANNEL_UPDATE_FAILED');
    }

    return {
      videoId: normalizedVideoId,
      status: 'Uploaded',
      lastUploadAt,
    };
  }
}

export const youtubeUploadService = new YoutubeUploadService();
