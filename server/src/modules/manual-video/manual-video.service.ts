import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';
import { paths } from '../../config/paths.js';
import { requireYoutubeVideoId } from '../../infrastructure/youtube/youtube-url.js';
import { AppError } from '../../shared/http/errors.js';
import { generateId } from '../../shared/id.js';
import { emptyUsage } from '../video-agent/claude.js';
import { checkChannelFreshness } from '../video-agent/channel-freshness.js';
import { emitVideoAgentEvent } from '../video-agent/video-agent.events.js';
import { toRunSummary, videoAgentRepository, videoAgentRunDir } from '../video-agent/video-agent.repository.js';
import { videoAgentRunner } from '../video-agent/video-agent.runner.js';
import { executeVideoAgentTool, type ToolContext } from '../video-agent/video-agent.tools.js';
import { NARRATION_CHARS_PER_MIN } from '../video-agent/script-writer.js';
import { clearSceneArtifacts, SCENES_FILE } from '../video-agent/scene-retime.js';
import { parseSrt, srtTimestampToMs } from '../../infrastructure/subtitle/srt-utils.js';
import { splitCaption } from '../video-agent/narration.js';
import { appSettingsService } from '../app-settings/app-settings.service.js';
import { resolveAiRenderConfig } from '../video-production/shared/ai-video/ai-render-config.js';
import { AI_SLIDES_DIRNAME } from '../video-production/shared/ai-video/ai-video.constants.js';
import { generateAiSceneSlideImages } from '../video-production/shared/ai-video/index.js';
import type { AiVideoScenePrompt } from '../video-production/shared/ai-video/ai-video.types.js';
import { isKenBurnsEnabled } from '../video-production/shared/slideshow/slideshow.constants.js';
import { AI_VIDEOS_DIRNAME } from '../video-production/shared/ai-video/ai-video.constants.js';
import { buildSceneMotionPrompt, selectScenesForVideo } from '../video-production/shared/ai-video/ai-video-scene-clip-generator.js';
import { resolveSceneImageAbsolutePath } from '../video-production/shared/ai-video/ai-video-scene-timing.js';
import { isTitleScene } from '../video-production/shared/ai-video/ai-video-title-card.js';
import { resolveSceneVideoMode } from '../video-production/pipelines/reup-audio/steps/scene-video-clips.step.js';
import { generateVideosFromImagesWithFailover } from '../llm-browser/flow/flow-profile-failover.js';
import { FLOW_VIDEO_SETTINGS_ONLY, FLOW_VIDEO_SETTINGS_ONLY_REASON } from '../llm-browser/flow/flow-video-ui.js';
import { chromeProfilesService } from '../chrome-profiles/chrome-profiles.service.js';
import { closeChromeProfiles } from '../chrome-profiles/chrome-profile.runner.js';
import { ngramContainment } from '../video-agent/similarity.js';
import {
  VIDEO_MAX_MINUTES,
  VIDEO_MIN_MINUTES,
  type VideoAgentOutline,
  type VideoAgentRun,
  type VideoAgentRunSummary,
  type VideoAgentScript,
  type VideoAgentScriptChapter,
  type VideoAgentStage,
  type VideoAgentStep,
} from '../video-agent/video-agent.types.js';
import { buildLibrary, type ManualLibraryItem } from './manual-video.library.js';
import { scriptRemakeService, splitSentences, type RemakeJob } from '../script-remake/script-remake.service.js';
import type { LlmTextProvider } from '../llm-browser/core/types.js';
import { youtubeChannelsRepository } from '../youtube-channels/youtube-channels.repository.js';

export type ManualStep = 'sources' | 'voice' | 'scenes' | 'motion' | 'video';

/**
 * What each step occupies. Steps on different resources may run at the same time (voice while
 * images are drawn); two steps on the same resource never do, whichever project they belong to.
 */
const STEP_RESOURCE: Record<ManualStep, string> = {
  sources: 'tải transcript',
  voice: 'VOICEVOX',
  scenes: 'Chrome (vẽ ảnh)',
  // Flow runs in the same Chrome profiles as the image provider.
  motion: 'Chrome (vẽ ảnh)',
  video: 'ffmpeg (dựng video)',
};

const STEP_TOOL: Record<ManualStep, { tool: string; stage: VideoAgentStage }> = {
  sources: { tool: 'load_sources', stage: 'source' },
  voice: { tool: 'synthesize_voice', stage: 'voice' },
  scenes: { tool: 'generate_scene_images', stage: 'scenes' },
  motion: { tool: 'scene_video_clips', stage: 'motion' },
  video: { tool: 'assemble_video', stage: 'video' },
};

/** A pasted script shorter than this is almost certainly a mistake, not a video. */
const MIN_SCRIPT_CHARS = 300;

export interface ManualNarration {
  durationSec: number;
  speaker: number;
  speedScale: number;
  aligned: boolean;
  chapters: { heading: string; start: number; end: number; sentences: { text: string; start: number; end: number }[] }[];
}

export type ManualMotionMode = 'intro' | 'full' | 'scenes';

function sceneClipName(index: number): string {
  if (!Number.isInteger(index) || index < 0) throw new AppError('Số cảnh không hợp lệ', 400, 'VALIDATION_ERROR');
  return `scene-${String(index + 1).padStart(3, '0')}`;
}

export interface ManualSceneItem {
  index: number;
  startTime: string;
  endTime: string;
  durationSec: number;
  prompt: string;
  /** Set for locally rendered chapter title cards (no AI image prompt). */
  title?: string;
  references: string[];
  hasImage: boolean;
  /** Changes whenever the image file is replaced, so the browser fetches the new one. */
  imageVersion: number;
  /** The scene plays a Flow video clip instead of its still image. */
  hasClip: boolean;
  clipVersion: number;
}

function sceneImageFile(workDir: string, index: number): string {
  if (!Number.isInteger(index) || index < 0) throw new AppError('Số cảnh không hợp lệ', 400, 'VALIDATION_ERROR');
  return path.join(workDir, AI_SLIDES_DIRNAME, `scene-${String(index + 1).padStart(3, '0')}.jpg`);
}

export interface CreateManualProjectInput {
  channelId: string;
  sourceUrls: string[];
  notes?: string;
  voicevoxSpeaker?: number;
  speedScale?: number;
}

function requireRun(id: string): VideoAgentRun {
  const run = videoAgentRepository.findById(id);
  if (!run || run.mode !== 'manual') throw new AppError('Không tìm thấy dự án', 404, 'NOT_FOUND');
  return run;
}

function saveAndEmit(run: VideoAgentRun): VideoAgentRun {
  videoAgentRepository.save(run);
  emitVideoAgentEvent({ type: 'run_updated', run: toRunSummary(run) });
  return run;
}

function appendStep(run: VideoAgentRun, step: Omit<VideoAgentStep, 'id' | 'at'>): void {
  const full: VideoAgentStep = { id: generateId(), at: new Date().toISOString(), ...step };
  run.steps.push(full);
  videoAgentRepository.save(run);
  emitVideoAgentEvent({ type: 'step_appended', runId: run.id, step: full });
}

/** The pipeline tools word their ordering errors for the agent; the producer sees button names instead. */
function forProducer(message: string): string {
  return message
    .replace(/gọi request_approval/g, 'bấm "Duyệt kịch bản" ở bước 3')
    .replace(/gọi synthesize_voice trước/g, 'chạy bước "Giọng đọc" trước')
    .replace(/gọi generate_scene_images trước/g, 'chạy bước "Scene & ảnh" trước')
    .replace(/Gọi load_sources trước khi viết kịch bản/g, 'Tải transcript nguồn trước')
    .replace(/vào cấu hình kênh để chọn$/, 'vào cấu hình kênh để chọn, hoặc bấm "Đổi kênh" ở đầu dự án');
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Plain outline for scripts that did not come from the agent planner (no spine, no chapter forms). */
function plainOutline(title: string, angle: string, hook: string, chapters: VideoAgentScriptChapter[]): VideoAgentOutline {
  return {
    title,
    angle,
    hook,
    spine: { centralQuestion: '', thread: '', consensus: '', ourTake: '', originalElements: [] },
    chapters: chapters.map(chapter => ({
      heading: chapter.heading,
      keyPoints: [],
      form: 'scene',
      openingType: 'in_scene',
      tension: '',
      actionScene: '',
    })),
  };
}

/**
 * Script as editable text: `# title`, then `## 1. heading` followed by one sentence per line.
 * The same format is shown in the editor, so what the producer sees is what is parsed back.
 */
export function parseScriptText(text: string): { title: string; chapters: VideoAgentScriptChapter[] } {
  let title = '';
  const raw: { heading: string; lines: string[] }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const titleMatch = /^#\s+(.+)$/.exec(line);
    const headingMatch = /^##\s*(?:(?:Chapter|第)?\s*\d+\s*(?:章|[.):：])?\s*)?(.+)$/.exec(line);
    if (titleMatch) {
      title = titleMatch[1].trim();
    } else if (headingMatch) {
      raw.push({ heading: headingMatch[1].trim(), lines: [] });
    } else if (line.trim()) {
      if (raw.length === 0) raw.push({ heading: 'Mở đầu', lines: [] });
      raw[raw.length - 1].lines.push(line);
    }
  }
  const chapters = raw
    .map(item => ({ heading: item.heading, sentences: splitSentences(item.lines.join('\n')) }))
    .filter(chapter => chapter.sentences.length > 0);
  return { title, chapters };
}

export function scriptToText(title: string, chapters: VideoAgentScriptChapter[]): string {
  const body = chapters
    .map((chapter, index) => `## ${index + 1}. ${chapter.heading}\n${chapter.sentences.join('\n')}`)
    .join('\n\n');
  return `# ${title}\n\n${body}\n`;
}

function launchFileManager(dir: string): void {
  const [command, args]: [string, string[]] =
    process.platform === 'win32' ? ['explorer.exe', [dir]] : process.platform === 'darwin' ? ['open', [dir]] : ['xdg-open', [dir]];
  // explorer.exe exits with code 1 even when it opened the folder, so the result is ignored.
  execFile(command, args, () => undefined);
}

class ManualVideoService {
  private active = new Map<string, { runId: string; step: ManualStep; controller: AbortController }>();

  private activeOn(runId: string): ManualStep[] {
    return [...this.active.values()].filter(entry => entry.runId === runId).map(entry => entry.step);
  }

  private syncRunning(run: VideoAgentRun): void {
    const steps = this.activeOn(run.id);
    run.activeStages = steps.map(step => STEP_TOOL[step].stage);
    if (steps.length > 0) run.status = 'running';
    else run.status = run.artifacts.videoPath && run.stagesDone.includes('video') ? 'completed' : 'draft';
  }

  storageRoot(): string {
    return path.resolve(paths.videoAgentRunsDir);
  }

  list(): VideoAgentRunSummary[] {
    return videoAgentRepository
      .findAll()
      .filter(run => run.mode === 'manual')
      .map(toRunSummary);
  }

  get(id: string): VideoAgentRun {
    return requireRun(id);
  }

  create(input: CreateManualProjectInput): VideoAgentRun {
    const channel = youtubeChannelsRepository.findById(input.channelId);
    if (!channel) throw new AppError('Không tìm thấy kênh đích', 404, 'NOT_FOUND');
    const sourceUrls = this.normalizeUrls(input.sourceUrls);

    const now = new Date().toISOString();
    const run: VideoAgentRun = {
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      mode: 'manual',
      status: 'draft',
      input: {
        sourceUrls,
        channelId: channel.id,
        ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
        voicevoxSpeaker: input.voicevoxSpeaker ?? env.voicevoxSpeaker,
        speedScale: input.speedScale ?? 1,
        // Approval is a button the producer presses; the voice step refuses to run before it.
        requireApproval: true,
      },
      channelName: channel.name,
      model: 'manual',
      stagesDone: [],
      steps: [],
      usage: emptyUsage(),
      artifacts: { sources: [] },
      turns: 0,
    };
    appendStep(run, { kind: 'system', title: 'Tạo dự án', detail: `Lưu tại ${videoAgentRunDir(run.id)}` });
    return saveAndEmit(run);
  }

  private normalizeUrls(urls: string[]): string[] {
    const unique = [...new Set(urls.map(url => url.trim()).filter(Boolean))];
    if (unique.length === 0) throw new AppError('Cần ít nhất một link YouTube', 400, 'VALIDATION_ERROR');
    for (const url of unique) requireYoutubeVideoId(url);
    return unique;
  }

  /** Runs one pipeline step in the background; progress and errors land on the project. */
  runStep(id: string, step: ManualStep, options: { urls?: string[]; voicevoxSpeaker?: number; speedScale?: number } = {}): VideoAgentRun {
    const run = requireRun(id);
    this.assertCanStart(run, step);
    if (step === 'sources' && options.urls) run.input.sourceUrls = this.normalizeUrls(options.urls);
    if (step === 'voice') {
      if (options.voicevoxSpeaker !== undefined) run.input.voicevoxSpeaker = options.voicevoxSpeaker;
      if (options.speedScale !== undefined) run.input.speedScale = options.speedScale;
    }
    const { tool } = STEP_TOOL[step];
    // A full re-run cuts the script into new scenes; images are reused by file name, so old ones must go first.
    const redoScenes = step === 'scenes' && run.stagesDone.includes('scenes');
    return this.startJob(run, step, tool, async ctx => {
      if (redoScenes) {
        await clearSceneArtifacts(ctx.workDir);
        run.stagesDone = run.stagesDone.filter(stage => stage !== 'scenes' && stage !== 'video');
        run.artifacts.sceneCount = undefined;
        run.artifacts.imagesGenerated = undefined;
        run.artifacts.sceneTimingBasis = undefined;
        ctx.note('Xoá scene và ảnh cũ trước khi chia cảnh lại');
      }
      const outcome = await executeVideoAgentTool(tool, {}, ctx);
      return 'content' in outcome ? outcome.content : '';
    });
  }

  private assertCanStart(run: VideoAgentRun, step: ManualStep): void {
    const id = run.id;
    const busyResource = [...this.active.values()].find(entry => STEP_RESOURCE[entry.step] === STEP_RESOURCE[step]);
    if (busyResource) {
      throw new AppError(`${STEP_RESOURCE[step]} đang được một bước khác dùng — chờ xong rồi thử lại`, 409, 'MANUAL_BUSY');
    }
    const onRun = this.activeOn(id);
    // Rendering needs voice and images settled, and new sources change what every later step is built on.
    if (onRun.length > 0 && (step === 'video' || step === 'sources' || onRun.includes('video') || onRun.includes('sources'))) {
      throw new AppError('Dự án đang chạy một bước khác — chờ xong rồi thử lại', 409, 'MANUAL_BUSY');
    }
    if (videoAgentRunner.isBusy()) {
      throw new AppError('Agent đang chạy và dùng chung Chrome/VOICEVOX — chờ agent xong', 409, 'AGENT_BUSY');
    }
  }

  /** Runs `work` in the background under the step's lock; its result or error lands in the timeline. */
  private startJob(run: VideoAgentRun, step: ManualStep, label: string, work: (ctx: ToolContext) => Promise<string>): VideoAgentRun {
    const id = run.id;
    const tool = label;
    const { stage } = STEP_TOOL[step];
    const controller = new AbortController();
    const key = `${id}:${step}`;
    this.active.set(key, { runId: id, step, controller });
    run.currentStage = stage;
    run.error = undefined;
    this.syncRunning(run);
    saveAndEmit(run);

    const ctx: ToolContext = {
      run,
      workDir: videoAgentRunDir(run.id),
      usage: run.usage,
      signal: controller.signal,
      note: (title, detail) => appendStep(run, { kind: 'system', title: truncate(title, 300), detail }),
      markStage: done => {
        if (!run.stagesDone.includes(done)) run.stagesDone.push(done);
      },
    };

    void (async () => {
      const startedAt = Date.now();
      appendStep(run, { kind: 'tool_call', toolName: tool, title: tool });
      try {
        const content = await work(ctx);
        appendStep(run, {
          kind: 'tool_result',
          toolName: tool,
          title: truncate(content.split('\n')[0] ?? '', 200),
          // Source transcripts are huge and already saved as files; the timeline keeps only the head.
          detail: step === 'sources' ? undefined : truncate(content, 20000),
          durationMs: Date.now() - startedAt,
        });
      } catch (err) {
        const aborted = controller.signal.aborted;
        const message = aborted ? 'Đã huỷ' : forProducer(err instanceof Error ? err.message : String(err));
        run.error = aborted ? undefined : message;
        appendStep(run, {
          kind: aborted ? 'system' : 'tool_result',
          toolName: tool,
          title: truncate(message, 200),
          detail: !aborted && err instanceof Error && err.stack ? truncate(err.stack, 4000) : undefined,
          durationMs: Date.now() - startedAt,
          isError: !aborted,
        });
      } finally {
        this.active.delete(key);
        run.currentStage = run.activeStages?.find(active => active !== stage);
        this.syncRunning(run);
        saveAndEmit(run);
      }
    })();

    return run;
  }

  /** Scenes as cut and drawn, with what the producer needs to review and redraw them. */
  async listScenes(id: string): Promise<ManualSceneItem[]> {
    const run = requireRun(id);
    const workDir = videoAgentRunDir(run.id);
    const raw = await fsp.readFile(path.join(workDir, SCENES_FILE), 'utf8').catch(() => null);
    if (!raw) return [];
    const scenes = JSON.parse(raw) as AiVideoScenePrompt[];
    return scenes.map((scene, index) => {
      const imagePath = sceneImageFile(workDir, index);
      const stat = fs.statSync(imagePath, { throwIfNoEntry: false });
      const clip = scene.videoPath ? fs.statSync(path.join(workDir, scene.videoPath), { throwIfNoEntry: false }) : undefined;
      return {
        index,
        startTime: scene.startTime,
        endTime: scene.endTime,
        durationSec: Math.max(0, (srtTimestampToMs(scene.endTime) - srtTimestampToMs(scene.startTime)) / 1000),
        prompt: scene.prompt ?? '',
        ...(scene.type === 'title' ? { title: scene.title ?? '' } : {}),
        references: scene.references ?? [],
        hasImage: Boolean(stat?.isFile()),
        imageVersion: stat?.mtimeMs ? Math.round(stat.mtimeMs) : 0,
        hasClip: Boolean(clip?.isFile()),
        clipVersion: clip?.mtimeMs ? Math.round(clip.mtimeMs) : 0,
      };
    });
  }

  /**
   * The narration split back into the script's sentences with their real start/end, grouped by chapter.
   * Each sentence becomes as many subtitle cues as `splitCaption` makes of it, which is how the voice
   * step wrote the track, so walking the script in order recovers every sentence's span.
   */
  async narration(id: string): Promise<ManualNarration | null> {
    const run = requireRun(id);
    const subtitlePath = run.artifacts.subtitlePath;
    if (!run.script || !subtitlePath || !run.artifacts.audioPath) return null;
    const cues = parseSrt(await fsp.readFile(subtitlePath, 'utf8'));
    const toSec = (srt: string) => srtTimestampToMs(srt) / 1000;
    let cursor = 0;
    const chapters = run.script.chapters.map(chapter => {
      const sentences = chapter.sentences.map(text => {
        const count = splitCaption(text).length;
        const first = cues[cursor];
        const last = cues[cursor + count - 1];
        cursor += count;
        return { text, start: first ? toSec(first.start) : 0, end: last ? toSec(last.end) : 0 };
      });
      return {
        heading: chapter.heading,
        start: sentences[0]?.start ?? 0,
        end: sentences[sentences.length - 1]?.end ?? 0,
        sentences,
      };
    });
    return {
      durationSec: run.artifacts.audioDurationSec ?? 0,
      speaker: run.input.voicevoxSpeaker,
      speedScale: run.input.speedScale,
      // Fewer or more cues than the script implies means the track no longer matches it; timings are then approximate.
      aligned: cursor === cues.length,
      chapters,
    };
  }

  audioFile(id: string): string {
    const run = requireRun(id);
    const file = run.artifacts.audioPath;
    if (!file || !fs.existsSync(file)) throw new AppError('Chưa có giọng đọc', 404, 'NOT_FOUND');
    return file;
  }

  sceneImage(id: string, index: number): string {
    const run = requireRun(id);
    const file = sceneImageFile(videoAgentRunDir(run.id), index);
    if (!fs.existsSync(file)) throw new AppError('Cảnh này chưa có ảnh', 404, 'NOT_FOUND');
    return file;
  }

  /** Redraws one scene, optionally with a rewritten prompt, keeping every other scene and the current timing. */
  regenerateScene(id: string, index: number, prompt?: string): VideoAgentRun {
    const run = requireRun(id);
    if (!run.stagesDone.includes('scenes')) throw new AppError('Chưa có scene — chạy bước Scene & ảnh trước', 409, 'STAGE_ORDER');
    this.assertCanStart(run, 'scenes');
    return this.startJob(run, 'scenes', 'redraw_scene', async ctx => {
      const scenesPath = path.join(ctx.workDir, SCENES_FILE);
      const scenes = JSON.parse(await fsp.readFile(scenesPath, 'utf8')) as AiVideoScenePrompt[];
      const scene = scenes[index];
      if (!scene) throw new AppError(`Không có cảnh ${index + 1}`, 400, 'VALIDATION_ERROR');
      const edited = prompt?.trim();
      if (edited && scene.type !== 'title') scene.prompt = edited;
      ctx.note(`Vẽ lại cảnh ${index + 1}${edited ? ' với prompt mới' : ''}`, scene.prompt);

      const renderConfig = await resolveAiRenderConfig(ctx.workDir, { kenBurns: isKenBurnsEnabled() });
      const settings = appSettingsService.get();
      const result = await generateAiSceneSlideImages({
        workDir: ctx.workDir,
        channelId: run.input.channelId,
        youtubeVideoId: run.id,
        scenes,
        forceIndexes: [index],
        audioSpeed: renderConfig.audioSpeed,
        kenBurns: settings.kenBurnsOnPrepare && settings.enableKenBurns,
        onLog: msg => ctx.note(msg),
      });
      // Keep the current (possibly voice-matched) timing; only the image path comes from the redraw.
      const merged = scenes.map((item, i) => ({ ...item, path: result.scenes[i]?.path ?? item.path }));
      // A clip animated from the old image no longer matches the new one.
      if (merged[index]?.videoPath) {
        await fsp.rm(path.join(ctx.workDir, merged[index].videoPath!), { force: true });
        delete merged[index].videoPath;
        run.artifacts.clipsGenerated = merged.filter(item => item.videoPath).length;
        ctx.note(`Bỏ clip cũ của cảnh ${index + 1} (ảnh đã đổi)`);
      }
      await fsp.writeFile(scenesPath, JSON.stringify(merged, null, 2), 'utf8');
      if (result.failedCount > 0) throw new AppError(`Vẽ lại cảnh ${index + 1} thất bại`, 502, 'SCENE_REDRAW_FAILED');
      // A rendered video still shows the old image.
      run.stagesDone = run.stagesDone.filter(stage => stage !== 'video');
      return `Đã vẽ lại cảnh ${index + 1}`;
    });
  }

  /**
   * Moves the project to another channel. Scenes already drawn keep the old channel's style until the
   * producer redraws them; a rendered video is dropped because it was cut with the old channel's settings.
   */
  setChannel(id: string, channelId: string): VideoAgentRun {
    const run = requireRun(id);
    this.assertIdle(run);
    const channel = youtubeChannelsRepository.findById(channelId);
    if (!channel) throw new AppError('Không tìm thấy kênh đích', 404, 'NOT_FOUND');
    if (channel.id === run.input.channelId) return run;
    const previous = run.channelName;
    run.input.channelId = channel.id;
    run.channelName = channel.name;
    run.error = undefined;
    run.stagesDone = run.stagesDone.filter(stage => stage !== 'video');
    // Freshness compares against the channel's own earlier videos, so it changes with the channel.
    if (run.script) {
      run.script.freshness = checkChannelFreshness({
        runId: run.id,
        channelId: channel.id,
        outline: run.script.outline,
        chapters: run.script.chapters,
      });
    }
    appendStep(run, { kind: 'system', title: `Đổi kênh: ${previous} → ${channel.name}` });
    return saveAndEmit(run);
  }

  /** Default for the image → video step, from the channel's video type. */
  motionDefault(run: VideoAgentRun): ManualMotionMode | 'none' {
    const channel = youtubeChannelsRepository.findById(run.input.channelId);
    return resolveSceneVideoMode(channel?.reupAudioVideoType) ?? 'none';
  }

  /**
   * Animates scene images into Flow (Veo) clips. `intro` = scenes starting in the first
   * AI_INTRO_VIDEO_SEC seconds, `full` = every scene, `scenes` = the given ones. Scenes that already
   * have a clip keep it (remove it first to make a new one); scenes whose clip fails keep their image.
   */
  generateClips(id: string, mode: ManualMotionMode, indexes: number[] = []): VideoAgentRun {
    const run = requireRun(id);
    if (!run.stagesDone.includes('scenes')) throw new AppError('Chưa có scene — chạy bước Scene & ảnh trước', 409, 'STAGE_ORDER');
    this.assertCanStart(run, 'motion');
    return this.startJob(run, 'motion', 'scene_video_clips', async ctx => {
      const scenesPath = path.join(ctx.workDir, SCENES_FILE);
      const scenes = JSON.parse(await fsp.readFile(scenesPath, 'utf8')) as AiVideoScenePrompt[];
      const wanted =
        mode === 'scenes'
          ? indexes.filter(index => scenes[index]?.path?.trim() && !isTitleScene(scenes[index]!))
          : selectScenesForVideo(scenes, mode);
      const todo = wanted.filter(index => !scenes[index]!.videoPath || !fs.existsSync(path.join(ctx.workDir, scenes[index]!.videoPath!)));
      if (todo.length === 0) return wanted.length === 0 ? 'Không có cảnh nào để tạo video' : 'Các cảnh đã chọn đều có clip rồi';

      const videosDir = path.join(ctx.workDir, AI_VIDEOS_DIRNAME);
      ctx.note(`Tạo ${todo.length} clip qua Google Flow (Veo)`, todo.map(index => `#${index + 1}`).join(', '));
      const mains = chromeProfilesService.listMainProfiles();
      let failed: { name: string; reason: string }[] = [];
      try {
        const result = await generateVideosFromImagesWithFailover(
          todo.map(index => ({
            name: sceneClipName(index),
            imagePath: resolveSceneImageAbsolutePath(ctx.workDir, scenes[index]!),
            prompt: buildSceneMotionPrompt(scenes[index]!.prompt),
          })),
          { outputDir: videosDir },
          { onProfileSwitch: (from, to, remaining) => ctx.note(`Flow hết lượt ở ${from.name}, chuyển sang ${to.name} (còn ${remaining} clip)`) },
        );
        failed = result.failed;
      } finally {
        // Settings-only check mode leaves Chrome open on the Flow prompt bar.
        if (!FLOW_VIDEO_SETTINGS_ONLY) await closeChromeProfiles(mains.map(profile => profile.id));
      }
      if (FLOW_VIDEO_SETTINGS_ONLY) {
        return `${FLOW_VIDEO_SETTINGS_ONLY_REASON} — Chrome đang mở ở thanh prompt của Flow để bạn kiểm tra`;
      }

      // Re-read: the scene list may have been re-timed to a new voice while the clips were made.
      const latest = JSON.parse(await fsp.readFile(scenesPath, 'utf8')) as AiVideoScenePrompt[];
      for (const index of todo) {
        const relative = path.posix.join(AI_VIDEOS_DIRNAME, `${sceneClipName(index)}.mp4`);
        if (latest[index] && fs.existsSync(path.join(ctx.workDir, relative))) latest[index].videoPath = relative;
      }
      await fsp.writeFile(scenesPath, JSON.stringify(latest, null, 2), 'utf8');
      const made = todo.filter(index => latest[index]?.videoPath).length;
      run.artifacts.clipsGenerated = latest.filter(scene => scene.videoPath).length;
      if (run.artifacts.clipsGenerated > 0 && !run.stagesDone.includes('motion')) run.stagesDone.push('motion');
      // The rendered video still shows the stills.
      if (made > 0) run.stagesDone = run.stagesDone.filter(stage => stage !== 'video');
      for (const failure of failed) ctx.note(`${failure.name}: không tạo được clip, giữ ảnh — ${failure.reason}`);
      if (made === 0) throw new AppError(`Không tạo được clip nào (${failed[0]?.reason ?? 'Flow không trả video'})`, 502, 'FLOW_VIDEO_FAILED');
      return `Đã tạo ${made}/${todo.length} clip${failed.length ? ` — ${failed.length} cảnh giữ ảnh` : ''}`;
    });
  }

  sceneClip(id: string, index: number): string {
    const run = requireRun(id);
    const file = path.join(videoAgentRunDir(run.id), AI_VIDEOS_DIRNAME, `${sceneClipName(index)}.mp4`);
    if (!fs.existsSync(file)) throw new AppError('Cảnh này chưa có clip', 404, 'NOT_FOUND');
    return file;
  }

  /** Back to the still image for one scene. */
  async removeClip(id: string, index: number): Promise<VideoAgentRun> {
    const run = requireRun(id);
    this.assertIdle(run);
    const workDir = videoAgentRunDir(run.id);
    const scenesPath = path.join(workDir, SCENES_FILE);
    const scenes = JSON.parse(await fsp.readFile(scenesPath, 'utf8')) as AiVideoScenePrompt[];
    if (!scenes[index]) throw new AppError(`Không có cảnh ${index + 1}`, 400, 'VALIDATION_ERROR');
    await fsp.rm(path.join(workDir, AI_VIDEOS_DIRNAME, `${sceneClipName(index)}.mp4`), { force: true });
    delete scenes[index].videoPath;
    await fsp.writeFile(scenesPath, JSON.stringify(scenes, null, 2), 'utf8');
    run.artifacts.clipsGenerated = scenes.filter(scene => scene.videoPath).length;
    if (run.artifacts.clipsGenerated === 0) run.stagesDone = run.stagesDone.filter(stage => stage !== 'motion');
    run.stagesDone = run.stagesDone.filter(stage => stage !== 'video');
    appendStep(run, { kind: 'system', title: `Bỏ clip cảnh ${index + 1}, dùng lại ảnh` });
    return saveAndEmit(run);
  }

  cancel(id: string): VideoAgentRun {
    const run = requireRun(id);
    for (const entry of this.active.values()) if (entry.runId === id) entry.controller.abort();
    return run;
  }

  /** Replaces the script with the producer's own text, then re-measures it against sources and channel. */
  async saveScript(id: string, text: string, lengthReason = 'Kịch bản nhập hoặc chỉnh tay'): Promise<VideoAgentRun> {
    const run = requireRun(id);
    this.assertIdle(run);
    const parsed = parseScriptText(text);
    const title = parsed.title || run.title || `Video ${new Date().toLocaleDateString('vi-VN')}`;
    return this.setScript(run, {
      title,
      chapters: parsed.chapters,
      angle: run.script?.outline.angle ?? '',
      hook: run.script?.outline.hook ?? '',
      plannedMinutes: undefined,
      lengthReason,
    });
  }

  private assertIdle(run: VideoAgentRun): void {
    if (this.activeOn(run.id).length > 0) throw new AppError('Một bước đang chạy trên dự án này', 409, 'MANUAL_BUSY');
  }

  private async setScript(
    run: VideoAgentRun,
    input: {
      title: string;
      chapters: VideoAgentScriptChapter[];
      angle: string;
      hook: string;
      plannedMinutes?: number;
      lengthReason: string;
    },
  ): Promise<VideoAgentRun> {
    const body = input.chapters.map(chapter => chapter.sentences.join('')).join('');
    if (input.chapters.length === 0 || body.length < MIN_SCRIPT_CHARS) {
      throw new AppError(
        `Kịch bản quá ngắn (${body.length} ký tự, cần ít nhất ${MIN_SCRIPT_CHARS}). Dạng đúng: dòng "# Tiêu đề", mỗi chương bắt đầu bằng "## 1. Tên chương", mỗi câu một dòng.`,
        400,
        'SCRIPT_TOO_SHORT',
      );
    }

    const estimatedMinutes = Math.round((body.length / NARRATION_CHARS_PER_MIN) * 10) / 10;
    const outline = plainOutline(input.title, input.angle, input.hook, input.chapters);
    const sourceTexts: string[] = [];
    for (const source of run.artifacts.sources) {
      sourceTexts.push(await fsp.readFile(source.transcriptPath, 'utf8').catch(() => ''));
    }
    const script: VideoAgentScript = {
      outline,
      chapters: input.chapters,
      plannedMinutes:
        input.plannedMinutes ?? Math.min(VIDEO_MAX_MINUTES, Math.max(VIDEO_MIN_MINUTES, Math.round(estimatedMinutes))),
      lengthReason: input.lengthReason,
      totalChars: body.length,
      estimatedMinutes,
      similarity: run.artifacts.sources.map((source, index) => ({
        sourceVideoId: source.videoId,
        gram8: ngramContainment(body, sourceTexts[index] ?? '', 8),
        gram15: ngramContainment(body, sourceTexts[index] ?? '', 15),
      })),
      freshness: checkChannelFreshness({
        runId: run.id,
        channelId: run.input.channelId,
        outline,
        chapters: input.chapters,
      }),
      updatedAt: new Date().toISOString(),
    };

    const dir = videoAgentRunDir(run.id);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, 'script.json'), JSON.stringify(script, null, 2), 'utf8');
    await fsp.writeFile(path.join(dir, 'script.txt'), scriptToText(script.outline.title, script.chapters), 'utf8');
    run.script = script;
    run.title = script.outline.title;
    run.artifacts.scriptPath = path.join(dir, 'script.json');
    // A changed script invalidates approval, narration and everything built on them.
    run.stagesDone = run.stagesDone.filter(stage => stage === 'source');
    if (!run.stagesDone.includes('script')) run.stagesDone.push('script');
    run.artifacts.narrationFit = undefined;
    run.artifacts.audioPath = undefined;
    run.artifacts.subtitlePath = undefined;
    run.artifacts.audioDurationSec = undefined;
    // Scene images are reused by file name, so ones drawn for the old script would end up in the new video.
    await clearSceneArtifacts(dir);
    run.artifacts.scenePromptsPath = undefined;
    run.artifacts.sceneCount = undefined;
    run.artifacts.imagesGenerated = undefined;
    run.artifacts.sceneTimingBasis = undefined;
    appendStep(run, {
      kind: 'system',
      title: `Lưu kịch bản: ${script.totalChars} ký tự ≈ ${script.estimatedMinutes} phút, ${script.chapters.length} chương`,
    });
    return saveAndEmit(run);
  }

  /** Starts the browser-LLM (ChatGPT/Gemini) remake over this project's source transcripts. */
  async startRemake(
    id: string,
    input: { provider?: LlmTextProvider; promptSetId?: string; notes?: string },
  ): Promise<RemakeJob> {
    const run = requireRun(id);
    this.assertIdle(run);
    if (run.artifacts.sources.length === 0) {
      throw new AppError('Chưa tải transcript nguồn — chạy bước "Nguồn" trước', 409, 'STAGE_ORDER');
    }
    const parts: string[] = [];
    for (const [index, source] of run.artifacts.sources.entries()) {
      parts.push(`--- 参考動画${index + 1}: ${source.title} ---\n${await fsp.readFile(source.transcriptPath, 'utf8')}`);
    }
    const job = await scriptRemakeService.start({
      transcript: parts.join('\n\n'),
      outputDir: path.join(videoAgentRunDir(run.id), 'remake'),
      language: 'ja',
      notes: [run.input.notes, input.notes].filter(Boolean).join('\n') || undefined,
      promptSetId: input.promptSetId,
      provider: input.provider,
    });
    run.remakeJobId = job.id;
    appendStep(run, { kind: 'system', title: `Bắt đầu remake bằng ${job.provider} (${job.promptSetName ?? 'bộ prompt'})` });
    saveAndEmit(run);
    return job;
  }

  /** Uses a finished remake job as the project's script. */
  async importRemake(id: string, jobId?: string): Promise<VideoAgentRun> {
    const run = requireRun(id);
    this.assertIdle(run);
    const job = scriptRemakeService.get(jobId ?? run.remakeJobId ?? '');
    if (job.status !== 'done' || !job.result) {
      throw new AppError('Lượt remake chưa xong hoặc bị lỗi', 409, 'REMAKE_NOT_DONE');
    }
    const { result } = job;
    return this.setScript(run, {
      title: result.outline.title,
      chapters: result.chapters,
      angle: result.outline.angle,
      hook: result.outline.hook,
      plannedMinutes: result.plannedMinutes,
      lengthReason: result.lengthReason || 'LLM chọn',
    });
  }

  approve(id: string): VideoAgentRun {
    const run = requireRun(id);
    this.assertIdle(run);
    if (!run.script) throw new AppError('Chưa có kịch bản để duyệt', 409, 'STAGE_ORDER');
    if (!run.stagesDone.includes('approval')) run.stagesDone.push('approval');
    appendStep(run, { kind: 'system', title: 'Đã duyệt kịch bản' });
    return saveAndEmit(run);
  }

  remove(id: string): void {
    const run = requireRun(id);
    if (this.activeOn(run.id).length > 0) throw new AppError('Bước đang chạy — huỷ trước khi xoá', 409, 'MANUAL_BUSY');
    videoAgentRepository.remove(run.id);
    emitVideoAgentEvent({ type: 'run_removed', runId: run.id });
  }

  openFolder(id: string): { folder: string } {
    const run = videoAgentRepository.findById(id);
    if (!run) throw new AppError('Không tìm thấy dự án', 404, 'NOT_FOUND');
    const folder = videoAgentRunDir(run.id);
    if (!fs.existsSync(folder)) throw new AppError('Thư mục chưa tồn tại', 404, 'NOT_FOUND');
    launchFileManager(folder);
    return { folder };
  }

  /** Every project at any stage plus standalone transcript downloads, newest first. */
  library(): ManualLibraryItem[] {
    return buildLibrary();
  }

  /** Opens a folder in the file manager. Only folders inside the data directory are allowed. */
  openPath(target: string): { folder: string } {
    const resolved = path.resolve(target);
    const root = path.resolve(paths.dataDir) + path.sep;
    if (!resolved.startsWith(root)) throw new AppError('Chỉ mở được thư mục trong thư mục dữ liệu', 400, 'INVALID_PATH');
    if (!fs.statSync(resolved, { throwIfNoEntry: false })?.isDirectory()) {
      throw new AppError('Thư mục không tồn tại', 404, 'NOT_FOUND');
    }
    launchFileManager(resolved);
    return { folder: resolved };
  }
}

export const manualVideoService = new ManualVideoService();
