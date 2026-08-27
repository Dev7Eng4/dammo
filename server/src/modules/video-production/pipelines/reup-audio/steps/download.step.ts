import fs from 'node:fs/promises';
import path from 'node:path';
import { mediaDownloadDir, resolveSourceChannelVideoDir } from '../../../../../config/paths.js';
import { AppError } from '../../../../../shared/http/errors.js';
import { assertMediaFileComplete } from '../../../../../infrastructure/ffmpeg/ffmpeg-probe.js';
import { downloadYoutubeVideo } from '../../../../../infrastructure/youtube/youtube-video-downloader.js';
import {
  copySourceAssetsToDir,
  findSourceThumbnailPath,
  findSourceTranscriptPath,
} from '../../../../source-channels/source-assets.js';
import type { ChannelLanguage } from '../../../../youtube-channels/channel-language.js';
import {
  downloadReupAssets,
  downloadReupAudioAssets,
  type ReupAudioDownloadResult,
  type ReupDownloadResult,
} from '../../../shared/assets/asset-downloader.js';
import type { ProductionDestination } from '../../../ports/production-destination.port.js';
import type { TaskLogger } from '../task-logger.js';
import type { ReupVideoTask } from '../reup-audio.types.js';

export async function resolveReupAudioDownload(
  task: ReupVideoTask,
  language: ChannelLanguage,
  log: TaskLogger,
): Promise<ReupAudioDownloadResult> {
  const outputDir = mediaDownloadDir('youtube', task.videoId);

  if (task.sourceStatus === 'Downloaded') {
    const sourceAssetsDir = resolveSourceChannelVideoDir(task.sourceId, task.videoId);
    if (!sourceAssetsDir) {
      throw new AppError('Downloaded source folder not found', 404, 'SOURCE_ASSETS_NOT_FOUND');
    }

    log.info(`Copying pre-downloaded source assets for ${task.videoId}...`);

    await copySourceAssetsToDir(sourceAssetsDir, outputDir);
    const thumbnailPath = await findSourceThumbnailPath(outputDir);
    const transcriptPath = await findSourceTranscriptPath(outputDir);

    if (!transcriptPath) {
      throw new AppError('Pre-downloaded source assets incomplete after copy', 500, 'SOURCE_ASSETS_INCOMPLETE');
    }

    // A truncated audio file in the source cache would otherwise be carried all
    // the way into the render, where it turns into silence after a few minutes.
    const audioPath = path.join(outputDir, 'audio.mp3');
    await assertMediaFileComplete(audioPath, { label: 'audio.mp3' });

    return {
      youtubeVideoId: task.videoId,
      outputDir,
      ...(thumbnailPath ? { thumbnailPath } : {}),
      audioPath,
      transcriptPath,
    };
  }

  log.info(`Downloading audio + transcript (${language}) for source video ${task.videoId}...`);

  return downloadReupAudioAssets(task.link, language);
}

export async function resolveReupVideoDownload(
  task: ReupVideoTask,
  pipelineType: ProductionDestination['pipelineType'],
  language: ChannelLanguage,
  log: TaskLogger,
): Promise<ReupDownloadResult> {
  if (task.sourceStatus === 'Downloaded') {
    const outputDir = mediaDownloadDir('youtube', task.videoId);
    const sourceAssetsDir = resolveSourceChannelVideoDir(task.sourceId, task.videoId);
    if (!sourceAssetsDir) {
      throw new AppError('Downloaded source folder not found', 404, 'SOURCE_ASSETS_NOT_FOUND');
    }

    log.info(`Copying pre-downloaded source assets for ${task.videoId}...`);

    await copySourceAssetsToDir(sourceAssetsDir, outputDir);

    const videoPath = path.join(outputDir, 'video.mp4');
    try {
      await fs.access(videoPath);
      return {
        youtubeVideoId: task.videoId,
        outputDir,
        primaryPath: videoPath,
        videoPath,
      };
    } catch {
      log.info(`Downloading video file for ${task.videoId}...`);

      const downloadedVideoPath = await downloadYoutubeVideo(task.link, outputDir, {
        outputBasename: 'video',
      });

      return {
        youtubeVideoId: task.videoId,
        outputDir,
        primaryPath: downloadedVideoPath,
        videoPath: downloadedVideoPath,
      };
    }
  }

  log.info(`Downloading source video ${task.videoId}...`);

  return downloadReupAssets(task.link, pipelineType, language);
}
