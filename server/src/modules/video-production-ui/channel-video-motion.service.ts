import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { srtTimestampToMs } from '../../infrastructure/subtitle/srt-utils.js';
import { AppError } from '../../shared/http/errors.js';
import { closeChromeProfiles } from '../chrome-profiles/chrome-profile.runner.js';
import { chromeProfilesService } from '../chrome-profiles/chrome-profiles.service.js';
import { generateVideosFromImagesWithFailover } from '../llm-browser/flow/flow-profile-failover.js';
import { FLOW_VIDEO_SETTINGS_ONLY, FLOW_VIDEO_SETTINGS_ONLY_REASON } from '../llm-browser/flow/flow-video-ui.js';
import { resolveSceneVideoMode } from '../video-production/pipelines/reup-audio/steps/scene-video-clips.step.js';
import { buildSceneMotionPrompt, selectScenesForVideo } from '../video-production/shared/ai-video/ai-video-scene-clip-generator.js';
import { persistAiScenePromptsFile, resolveAiScenePromptsFilePath } from '../video-production/shared/ai-video/ai-video-scene-prompts-store.js';
import { resolveSceneImageAbsolutePath } from '../video-production/shared/ai-video/ai-video-scene-timing.js';
import { isTitleScene } from '../video-production/shared/ai-video/ai-video-title-card.js';
import { AI_VIDEOS_DIRNAME } from '../video-production/shared/ai-video/ai-video.constants.js';
import type { AiVideoScenePrompt, AiVideoScenePromptsFile } from '../video-production/shared/ai-video/ai-video.types.js';
import { youtubeChannelsRepository } from '../youtube-channels/youtube-channels.repository.js';
import { resolveProductionVideoFolder } from './video-production-ui.service.js';

export type ChannelVideoMotionMode = 'intro' | 'full' | 'scenes';

/** One scene as the "Ảnh → video" tab shows it (same shape as a manual project's scene item). */
export interface ChannelVideoMotionScene {
  index: number;
  startTime: string;
  endTime: string;
  durationSec: number;
  prompt: string;
  title?: string;
  references: string[];
  hasImage: boolean;
  imageVersion: number;
  hasClip: boolean;
  clipVersion: number;
}

export interface ChannelVideoMotionJob {
  status: 'running' | 'done' | 'failed';
  message?: string;
  error?: string;
}

export interface ChannelVideoMotionState {
  /** The channel's own image→video setting (what preparing a video would do). */
  motionDefault: ChannelVideoMotionMode | 'none';
  scenes: ChannelVideoMotionScene[];
  job: ChannelVideoMotionJob | null;
}

function sceneClipName(index: number): string {
  return `scene-${String(index + 1).padStart(3, '0')}`;
}

function readScenes(workDir: string): AiVideoScenePromptsFile | null {
  const filePath = resolveAiScenePromptsFilePath(workDir);
  if (!fs.existsSync(filePath)) return null;
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as AiVideoScenePromptsFile;
  return Array.isArray(raw?.scenes) ? raw : null;
}

function statFile(filePath: string | null): fs.Stats | undefined {
  return filePath ? fs.statSync(filePath, { throwIfNoEntry: false }) : undefined;
}

/**
 * "Ảnh → video" for a prepared/created channel video: turns scene images into Flow (Veo) clips,
 * like a manual project's motion step. Clips land in the video's own `videos/` folder and are picked
 * up the next time the video is assembled.
 */
class ChannelVideoMotionService {
  private jobs = new Map<string, ChannelVideoMotionJob>();

  private key(channelId: string, videoId: string): string {
    return `${channelId}:${videoId}`;
  }

  state(channelId: string, videoId: string): ChannelVideoMotionState {
    const workDir = resolveProductionVideoFolder(channelId, videoId);
    const channel = youtubeChannelsRepository.findById(channelId);
    const file = readScenes(workDir);
    const scenes = (file?.scenes ?? []).map((scene, index): ChannelVideoMotionScene => {
      let imagePath: string | null = null;
      try {
        imagePath = scene.path ? resolveSceneImageAbsolutePath(workDir, scene) : null;
      } catch {
        imagePath = null;
      }
      const image = statFile(imagePath);
      const clip = statFile(scene.videoPath ? path.join(workDir, scene.videoPath) : null);
      return {
        index,
        startTime: scene.startTime,
        endTime: scene.endTime,
        durationSec: Math.max(0, (srtTimestampToMs(scene.endTime) - srtTimestampToMs(scene.startTime)) / 1000),
        prompt: scene.prompt ?? '',
        ...(isTitleScene(scene) ? { title: scene.title ?? '' } : {}),
        references: scene.references ?? [],
        hasImage: Boolean(image?.isFile()),
        imageVersion: image?.mtimeMs ? Math.round(image.mtimeMs) : 0,
        hasClip: Boolean(clip?.isFile()),
        clipVersion: clip?.mtimeMs ? Math.round(clip.mtimeMs) : 0,
      };
    });
    return {
      motionDefault: resolveSceneVideoMode(channel?.reupAudioVideoType) ?? 'none',
      scenes,
      job: this.jobs.get(this.key(channelId, videoId)) ?? null,
    };
  }

  /** Starts making clips in the background; scenes that already have one keep it. */
  generate(channelId: string, videoId: string, mode: ChannelVideoMotionMode, indexes: number[] = []): ChannelVideoMotionState {
    const key = this.key(channelId, videoId);
    if (this.jobs.get(key)?.status === 'running') {
      throw new AppError('Đang tạo clip cho video này — chờ xong rồi thử lại', 409, 'MOTION_BUSY');
    }
    const workDir = resolveProductionVideoFolder(channelId, videoId);
    const file = readScenes(workDir);
    if (!file || file.scenes.length === 0) throw new AppError('Chưa có scene — tạo scene & ảnh trước', 409, 'STAGE_ORDER');

    const scenes = file.scenes;
    const wanted =
      mode === 'scenes'
        ? indexes.filter(index => scenes[index]?.path?.trim() && !isTitleScene(scenes[index]!))
        : selectScenesForVideo(scenes, mode);
    const todo = wanted.filter(index => {
      const clip = scenes[index]!.videoPath;
      return !clip || !fs.existsSync(path.join(workDir, clip));
    });
    if (todo.length === 0) {
      throw new AppError(wanted.length === 0 ? 'Không có cảnh nào để tạo video' : 'Các cảnh đã chọn đều có clip rồi', 400, 'NOTHING_TO_DO');
    }

    const job: ChannelVideoMotionJob = { status: 'running', message: `Đang tạo ${todo.length} clip qua Google Flow` };
    this.jobs.set(key, job);

    void (async () => {
      const mains = chromeProfilesService.listProfilesForLlm('video', 'flow');
      try {
        let failed: { name: string; reason: string }[] = [];
        try {
          const result = await generateVideosFromImagesWithFailover(
            todo.map(index => ({
              name: sceneClipName(index),
              imagePath: resolveSceneImageAbsolutePath(workDir, scenes[index]!),
              prompt: buildSceneMotionPrompt(scenes[index]!.prompt),
            })),
            { outputDir: path.join(workDir, AI_VIDEOS_DIRNAME) },
            {
              onProfileSwitch: (from, to, remaining) => {
                job.message = `Flow hết lượt ở ${from.name}, chuyển sang ${to.name} (còn ${remaining} clip)`;
              },
            },
          );
          failed = result.failed;
        } finally {
          if (!FLOW_VIDEO_SETTINGS_ONLY) await closeChromeProfiles(mains.map(profile => profile.id));
        }
        if (FLOW_VIDEO_SETTINGS_ONLY) {
          Object.assign(job, { status: 'done', message: FLOW_VIDEO_SETTINGS_ONLY_REASON });
          return;
        }

        // Re-read: scenes may have been edited while the clips were being made.
        const latest = readScenes(workDir);
        if (!latest) throw new Error('Không đọc lại được danh sách scene');
        for (const index of todo) {
          const relative = path.posix.join(AI_VIDEOS_DIRNAME, `${sceneClipName(index)}.mp4`);
          if (latest.scenes[index] && fs.existsSync(path.join(workDir, relative))) latest.scenes[index].videoPath = relative;
        }
        await persistAiScenePromptsFile(workDir, latest.youtubeVideoId ?? videoId, latest.scenes);
        const made = todo.filter(index => latest.scenes[index]?.videoPath).length;
        if (made === 0) throw new Error(`Không tạo được clip nào (${failed[0]?.reason ?? 'Flow không trả video'})`);
        Object.assign(job, {
          status: 'done',
          message: `Đã tạo ${made}/${todo.length} clip${failed.length ? ` — ${failed.length} cảnh giữ ảnh` : ''}. Dựng lại video để dùng clip.`,
        });
      } catch (err) {
        Object.assign(job, { status: 'failed', error: err instanceof Error ? err.message : String(err) });
      }
    })();

    return this.state(channelId, videoId);
  }

  /** Back to the still image for one scene. */
  async removeClip(channelId: string, videoId: string, index: number): Promise<ChannelVideoMotionState> {
    if (this.jobs.get(this.key(channelId, videoId))?.status === 'running') {
      throw new AppError('Đang tạo clip cho video này — chờ xong rồi thử lại', 409, 'MOTION_BUSY');
    }
    const workDir = resolveProductionVideoFolder(channelId, videoId);
    const file = readScenes(workDir);
    const scene: AiVideoScenePrompt | undefined = file?.scenes[index];
    if (!file || !scene) throw new AppError(`Không có cảnh ${index + 1}`, 400, 'VALIDATION_ERROR');
    await fsp.rm(path.join(workDir, AI_VIDEOS_DIRNAME, `${sceneClipName(index)}.mp4`), { force: true });
    delete scene.videoPath;
    await persistAiScenePromptsFile(workDir, file.youtubeVideoId ?? videoId, file.scenes);
    return this.state(channelId, videoId);
  }

  clipFile(channelId: string, videoId: string, index: number): string {
    const workDir = resolveProductionVideoFolder(channelId, videoId);
    const file = path.join(workDir, AI_VIDEOS_DIRNAME, `${sceneClipName(index)}.mp4`);
    if (!fs.existsSync(file)) throw new AppError('Cảnh này chưa có clip', 404, 'NOT_FOUND');
    return file;
  }
}

export const channelVideoMotionService = new ChannelVideoMotionService();
