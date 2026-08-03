import fs from 'node:fs/promises';
import { sourceChannelVideoDir } from '../../config/paths.js';
import { downloadYoutubeVideo } from '../../infrastructure/youtube/youtube-video-downloader.js';
import { AppError } from '../../shared/http/errors.js';
import { downloadSourceAudioAssets } from '../video-production/shared/assets/asset-downloader.js';
import { taskQueueRepository } from '../task-queue/task-queue.repository.js';
import { sourceChannelsRepository } from './source-channels.repository.js';
import type { SourcePurpose, SourceVideoRecord } from './source-channels.types.js';
import {
  DEFAULT_SOURCE_TRANSCRIPT_LANGUAGE,
  SOURCE_VIDEOS_PER_DOWNLOAD_RUN,
} from './source-download.constants.js';
import { sourceVideosRepository } from './source-videos.repository.js';

const DOWNLOADABLE_PURPOSES = new Set<SourcePurpose>(['reup', 'background_footage']);

export interface DownloadSourceVideosOptions {
  maxVideos?: number;
  taskJobId?: string;
}

export interface DownloadSourceVideosResult {
  sourceId: string;
  sourceName: string;
  downloaded: string[];
  skipped: string[];
  failed: Array<{ videoId: string; reason: string }>;
}

function isNotDownloaded(video: SourceVideoRecord): boolean {
  return video.status !== 'Downloaded';
}

function log(taskJobId: string | undefined, level: 'info' | 'ok' | 'err', message: string): void {
  if (!taskJobId) {
    console.log(message);
    return;
  }
  taskQueueRepository.appendLogMessage(taskJobId, level, message);
}

export class SourceDownloadService {
  async downloadVideosForSource(
    sourceId: string,
    options?: DownloadSourceVideosOptions,
  ): Promise<DownloadSourceVideosResult> {
    const source = sourceChannelsRepository.findById(sourceId);
    if (!source) {
      throw new AppError('Source channel not found', 404, 'NOT_FOUND');
    }

    if (source.platform !== 'youtube') {
      throw new AppError('Only YouTube sources can be downloaded', 400, 'UNSUPPORTED_PLATFORM');
    }

    if (!DOWNLOADABLE_PURPOSES.has(source.purpose)) {
      throw new AppError(
        'Only reup and background_footage sources can be downloaded',
        400,
        'UNSUPPORTED_PURPOSE',
      );
    }

    const store = sourceVideosRepository.read(sourceId);
    if (!store || store.videos.length === 0) {
      throw new AppError('No source videos available', 400, 'NO_SOURCE_VIDEOS');
    }

    const limit = options?.maxVideos ?? SOURCE_VIDEOS_PER_DOWNLOAD_RUN;
    const pending = store.videos.filter(video => Boolean(video.url) && isNotDownloaded(video)).slice(0, limit);

    const result: DownloadSourceVideosResult = {
      sourceId,
      sourceName: source.name,
      downloaded: [],
      skipped: [],
      failed: [],
    };

    if (pending.length === 0) {
      log(options?.taskJobId, 'info', `No pending videos to download for ${source.name}`);
      return result;
    }

    const modeLabel =
      source.purpose === 'background_footage' ? 'video mp4' : 'audio, thumbnail, transcript';

    log(
      options?.taskJobId,
      'info',
      `Downloading up to ${pending.length} video(s) for ${source.name} (${modeLabel}, newest first)...`,
    );

    for (const video of pending) {
      const outputDir = sourceChannelVideoDir(sourceId, video.id);

      try {
        if (options?.taskJobId) {
          taskQueueRepository.setLivePhase(options.taskJobId, 'downloading');
        }

        log(options?.taskJobId, 'info', `Downloading ${video.title} (${video.id})...`);
        await fs.mkdir(outputDir, { recursive: true });

        if (source.purpose === 'background_footage') {
          const videoPath = await downloadYoutubeVideo(video.url, outputDir, {
            outputBasename: 'video',
            onLog: msg => log(options?.taskJobId, 'info', msg),
          });

          sourceVideosRepository.markVideoDownloaded(sourceId, video.id);
          result.downloaded.push(video.id);

          log(options?.taskJobId, 'ok', `Downloaded → ${videoPath}`);
        } else {
          const downloaded = await downloadSourceAudioAssets(
            video.url,
            outputDir,
            DEFAULT_SOURCE_TRANSCRIPT_LANGUAGE,
          );

          sourceVideosRepository.markVideoDownloaded(sourceId, video.id);
          result.downloaded.push(video.id);

          log(
            options?.taskJobId,
            'ok',
            `Downloaded → ${downloaded.outputDir} (audio, thumbnail, transcript)`,
          );
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Unknown error';
        result.failed.push({ videoId: video.id, reason });
        log(options?.taskJobId, 'err', `Failed ${video.id}: ${reason}`);
      }
    }

    if (options?.taskJobId) {
      taskQueueRepository.setLivePhase(options.taskJobId, 'done');
    }

    return result;
  }

  async downloadVideosForSources(
    sourceIds: string[],
    options?: DownloadSourceVideosOptions,
  ): Promise<DownloadSourceVideosResult[]> {
    const results: DownloadSourceVideosResult[] = [];

    for (const sourceId of sourceIds) {
      results.push(await this.downloadVideosForSource(sourceId, options));
    }

    return results;
  }

  async downloadVideosForAllYoutubeSources(
    options?: DownloadSourceVideosOptions,
  ): Promise<DownloadSourceVideosResult[]> {
    const sourceIds = sourceChannelsRepository
      .findAll()
      .filter(
        source => source.platform === 'youtube' && DOWNLOADABLE_PURPOSES.has(source.purpose),
      )
      .map(source => source.id);

    return this.downloadVideosForSources(sourceIds, options);
  }
}

export const sourceDownloadService = new SourceDownloadService();
