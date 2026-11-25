import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../shared/http/errors.js';
import type { LlmTextProvider } from '../llm-browser/core/types.js';
import { parseScriptText, scriptToText } from '../manual-video/manual-video.service.js';
import { paths } from '../../config/paths.js';
import { findReadyScript } from '../script-remake/remake-ready.js';
import {
  REMAKE_CHARS_PER_MIN,
  remakeText,
  scriptRemakeService,
  type RemakeJob,
  type RemakeOutline,
  type RemakeResult,
} from '../script-remake/script-remake.service.js';
import { READING_CHECKS_FILE, synthesizeNarration, type ReadingCheck } from '../video-agent/narration.js';
import { retimeScenePromptsFile } from '../video-agent/scene-retime.js';
import { resolveAiScenePromptsFilePath } from '../video-production/shared/ai-video/ai-video-scene-prompts-store.js';
import { resolveNarrationVoice, type NarrationVoiceRef } from '../voice/narration-voice.js';
import { readVoiceSettings, resolveVoicevoxDefaultSpeaker } from '../../infrastructure/tts/voice-settings.store.js';
import type { RemakeAutoConfig } from '../youtube-channels/youtube-channels.types.js';
import { videoAgentRunner } from '../video-agent/video-agent.runner.js';
import { youtubeChannelsRepository } from '../youtube-channels/youtube-channels.repository.js';
import { resolveProductionVideoFolder } from './video-production-ui.service.js';

/**
 * Remake channels: a prepared/created video gets its own script (remade from the source transcript
 * by ChatGPT/Gemini, or typed) and a VOICEVOX narration that replaces the source audio.
 *
 * Folder layout, next to the pipeline files:
 * - `script.txt`            the remade script (`# title`, `## 1. heading`, one sentence per line)
 * - `remake/`               remake job output (txt + json)
 * - `narration/`            VOICEVOX work dir (per-sentence cache, wav)
 * - `source/`               the source video's audio.mp3 / transcript*.srt, moved here before the
 *                           first narration so they are never lost
 * - `remake-state.json`     last remake job id and the voice used
 * After narration, `audio.mp3` and `transcript.srt` are the narration's, so the existing scene,
 * assemble and metadata steps work unchanged.
 */

const SCRIPT_FILE = 'script.txt';
const STATE_FILE = 'remake-state.json';
const SOURCE_DIR = 'source';
/** Written when a video is started from a skill script (Preparing): its source/ holds only the source transcript. */
export const PREPARING_MARKER = path.join('source', 'from-skill-script.json');
const NARRATION_DIR = 'narration';
const AUDIO_FILE = 'audio.mp3';
const SOURCE_TRANSCRIPTS = ['transcript-updated.srt', 'transcript.srt'];

export interface ChannelVideoVoice {
  speaker: number;
  /** ×speed on top of the saved voice's own speed when `presetId` is set; otherwise the bare speaker's ×speed. */
  speedScale: number;
  /** Saved VOICEVOX voice (Settings → VOICEVOX) the narration was read with. */
  presetId?: string;
  durationSec: number;
  at: string;
}

/** What the remake planner decided for the new script; the metadata step builds the title on this angle. */
export interface RemakeOutlineHint {
  title: string;
  angle: string;
  hook: string;
}

interface RemakeState {
  remakeJobId?: string;
  /** Set when script.txt came from the skill's ready script instead of an LLM remake job. */
  skillScript?: { checkedAt: string; topicKey: string };
  voice?: ChannelVideoVoice;
  /**
   * The last narration changed most sentences after scenes were made: the images no longer show what is
   * said. `promptsGeneratedAt` is the scene file it applies to; new scenes clear it.
   */
  scenesStale?: { at: string; matchedPercent: number; promptsGeneratedAt: string };
}

export interface ChannelVideoVoiceJob {
  status: 'running' | 'done' | 'failed';
  progress?: string;
  error?: string;
  /** What happened to the scenes after the new narration. */
  notice?: string;
}

/** Scenes made against an older track keep their place by sentence; below this share of unchanged sentences they are out of date. */
const SCENES_STALE_RATIO = 0.6;

export interface ChannelVideoScriptResponse {
  text: string;
  chars: number;
  remakeJobId?: string;
  /** script.txt came from the nightly skill run (remake-ready/) instead of an LLM remake job. */
  skillScript?: RemakeState['skillScript'];
  /** Narration currently in audio.mp3; unset while the video still has the source audio. */
  voice?: ChannelVideoVoice;
  voiceJob?: ChannelVideoVoiceJob;
  /** The source audio was replaced by a narration (kept in `source/`). */
  sourceReplaced: boolean;
  /** Numbers, names and Latin words of the last narration, and how the voice read them. */
  readingChecks?: ReadingCheck[];
  /** Scenes were made for a script that has since changed a lot: create scenes again. */
  scenesStale?: { matchedPercent: number };
}

function scenePromptsGeneratedAt(workDir: string): string | null {
  try {
    const raw = JSON.parse(fs.readFileSync(resolveAiScenePromptsFilePath(workDir), 'utf8')) as { generatedAt?: string };
    return raw.generatedAt ?? null;
  } catch {
    return null;
  }
}

function readReadingChecks(workDir: string): ReadingCheck[] | undefined {
  try {
    return JSON.parse(fs.readFileSync(path.join(workDir, NARRATION_DIR, READING_CHECKS_FILE), 'utf8')) as ReadingCheck[];
  } catch {
    return undefined;
  }
}

function readState(workDir: string): RemakeState {
  try {
    return JSON.parse(fs.readFileSync(path.join(workDir, STATE_FILE), 'utf8')) as RemakeState;
  } catch {
    return {};
  }
}

async function writeState(workDir: string, patch: Partial<RemakeState>): Promise<void> {
  const next = { ...readState(workDir), ...patch };
  await fsp.writeFile(path.join(workDir, STATE_FILE), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

function requireRemakeChannel(channelId: string): void {
  const channel = youtubeChannelsRepository.findById(channelId);
  if (!channel) throw new AppError('Channel not found', 404, 'NOT_FOUND');
  if (channel.type !== 'remake_video') {
    throw new AppError('Chỉ kênh Remake video mới remake kịch bản và đọc giọng', 400, 'INVALID_CHANNEL_TYPE');
  }
}

/** The source video's transcript: from `source/` once a narration replaced it, else from the folder. */
function sourceTranscriptPath(workDir: string): string | null {
  for (const dir of [path.join(workDir, SOURCE_DIR), workDir]) {
    for (const name of SOURCE_TRANSCRIPTS) {
      const file = path.join(dir, name);
      if (fs.existsSync(file)) return file;
    }
  }
  return null;
}

class ChannelVideoRemakeService {
  private voiceJobs = new Map<string, ChannelVideoVoiceJob>();

  private key(channelId: string, videoId: string): string {
    return `${channelId}/${videoId}`;
  }

  /** Source audio of the video, or the narration once one replaced it. */
  audioFile(channelId: string, videoId: string): string {
    const file = path.join(resolveProductionVideoFolder(channelId, videoId), AUDIO_FILE);
    if (!fs.existsSync(file)) throw new AppError('Video chưa có audio.mp3', 404, 'AUDIO_NOT_FOUND');
    return file;
  }

  getScript(channelId: string, videoId: string): ChannelVideoScriptResponse {
    const workDir = resolveProductionVideoFolder(channelId, videoId);
    const file = path.join(workDir, SCRIPT_FILE);
    const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const state = readState(workDir);
    const voiceJob = this.voiceJobs.get(this.key(channelId, videoId));
    const readingChecks = readReadingChecks(workDir);
    const stale = state.scenesStale && state.scenesStale.promptsGeneratedAt === scenePromptsGeneratedAt(workDir);
    return {
      text,
      chars: parseScriptText(text).chapters.reduce((sum, chapter) => sum + chapter.sentences.join('').length, 0),
      ...(state.remakeJobId ? { remakeJobId: state.remakeJobId } : {}),
      ...(state.skillScript ? { skillScript: state.skillScript } : {}),
      ...(state.voice ? { voice: state.voice } : {}),
      ...(voiceJob ? { voiceJob } : {}),
      // Started from a skill script: there was never a source audio, the first narration is the audio.
      sourceReplaced:
        fs.existsSync(path.join(workDir, SOURCE_DIR, AUDIO_FILE)) ||
        (fs.existsSync(path.join(workDir, PREPARING_MARKER)) && Boolean(state.voice)),
      ...(readingChecks?.length ? { readingChecks } : {}),
      ...(stale ? { scenesStale: { matchedPercent: state.scenesStale!.matchedPercent } } : {}),
    };
  }

  async saveScript(channelId: string, videoId: string, text: string): Promise<ChannelVideoScriptResponse> {
    requireRemakeChannel(channelId);
    const workDir = resolveProductionVideoFolder(channelId, videoId);
    const { title, chapters } = parseScriptText(text);
    if (chapters.length === 0) throw new AppError('Kịch bản trống — cần ít nhất một chương có câu', 400, 'VALIDATION_ERROR');
    await fsp.writeFile(path.join(workDir, SCRIPT_FILE), scriptToText(title || videoId, chapters), 'utf8');
    return this.getScript(channelId, videoId);
  }

  /** ChatGPT/Gemini remake of the source transcript, with the same prompt sets as projects. */
  async startRemake(
    channelId: string,
    videoId: string,
    input: { provider?: LlmTextProvider; promptSetId?: string; notes?: string },
  ): Promise<RemakeJob> {
    requireRemakeChannel(channelId);
    const workDir = resolveProductionVideoFolder(channelId, videoId);
    const transcriptPath = sourceTranscriptPath(workDir);
    if (!transcriptPath) throw new AppError('Video chưa có transcript nguồn', 404, 'TRANSCRIPT_NOT_FOUND');
    const job = await scriptRemakeService.start({
      transcript: await fsp.readFile(transcriptPath, 'utf8'),
      outputDir: path.join(workDir, 'remake'),
      language: 'ja',
      notes: input.notes,
      promptSetId: input.promptSetId,
      provider: input.provider,
    });
    await writeState(workDir, { remakeJobId: job.id });
    return job;
  }

  /** Writes a finished remake job as the video's script. */
  async importRemake(channelId: string, videoId: string, jobId?: string): Promise<ChannelVideoScriptResponse> {
    requireRemakeChannel(channelId);
    const workDir = resolveProductionVideoFolder(channelId, videoId);
    const job = scriptRemakeService.get(jobId ?? readState(workDir).remakeJobId ?? '');
    if (job.status !== 'done' || !job.result) throw new AppError('Lượt remake chưa xong hoặc bị lỗi', 409, 'REMAKE_NOT_DONE');
    await fsp.writeFile(path.join(workDir, SCRIPT_FILE), scriptToText(job.result.outline.title, job.result.chapters), 'utf8');
    // The user chose an LLM remake over the skill's script.
    await writeState(workDir, { skillScript: undefined });
    return this.getScript(channelId, videoId);
  }

  /**
   * Reads script.txt with VOICEVOX in the background. The source audio/transcripts move to `source/`
   * the first time; audio.mp3 and transcript.srt then hold the narration. Existing scenes are moved onto
   * the new timing (see narrateFolder).
   */
  startVoice(
    channelId: string,
    videoId: string,
    input: { speaker: number; speedScale: number; presetId?: string },
  ): ChannelVideoScriptResponse {
    requireRemakeChannel(channelId);
    const preset = input.presetId
      ? readVoiceSettings().voicevox.presets.find(item => item.id === input.presetId)
      : undefined;
    if (input.presetId && !preset) {
      throw new AppError('Giọng VOICEVOX đã chọn không còn trong Cài đặt — chọn lại giọng', 400, 'VOICE_PRESET_NOT_FOUND');
    }
    const speaker = preset?.speaker ?? input.speaker;
    const workDir = resolveProductionVideoFolder(channelId, videoId);
    const key = this.key(channelId, videoId);
    if (this.voiceJobs.get(key)?.status === 'running') {
      throw new AppError('Video này đang đọc giọng — chờ xong rồi thử lại', 409, 'VOICE_BUSY');
    }
    this.assertVoiceFree();
    const chapters = readScriptChapters(workDir);

    const job: ChannelVideoVoiceJob = { status: 'running', progress: '0' };
    this.voiceJobs.set(key, job);
    void (async () => {
      try {
        await this.narrateFolder(workDir, chapters, {
          ref: { provider: 'voicevox', ...(preset ? { presetId: preset.id } : {}), voicevoxSpeaker: speaker },
          speaker,
          speedScale: input.speedScale,
          ...(preset ? { presetId: preset.id } : {}),
          onProgress: (done, total) => {
            job.progress = `${done}/${total}`;
          },
          onNotice: message => {
            job.notice = message;
          },
        });
        job.status = 'done';
      } catch (err) {
        job.status = 'failed';
        job.error = err instanceof Error ? err.message : String(err);
      }
    })();
    return this.getScript(channelId, videoId);
  }

  /** VOICEVOX serves one narration at a time: manual voice jobs, auto-remake runs and the video agent share it. */
  private assertVoiceFree(): void {
    if (this.autoNarrating || [...this.voiceJobs.values()].some(job => job.status === 'running')) {
      throw new AppError('VOICEVOX đang đọc giọng cho video khác — chờ xong rồi thử lại', 409, 'VOICE_BUSY');
    }
    if (videoAgentRunner.isBusy()) {
      throw new AppError('Agent đang chạy và dùng chung VOICEVOX — chờ agent xong', 409, 'AGENT_BUSY');
    }
  }

  private autoNarrating = false;

  /**
   * Reads `chapters` with VOICEVOX into `workDir`. The source audio/transcripts move to `source/` the
   * first time; audio.mp3 and transcript.srt then hold the narration, so scene/assemble/metadata steps
   * run on it unchanged. Scenes made earlier are moved onto the new timing sentence by sentence; when most
   * sentences changed (a new remake), they are flagged out of date instead of silently showing old images.
   */
  private async narrateFolder(
    workDir: string,
    chapters: ScriptChapters,
    voice: {
      ref: NarrationVoiceRef;
      speaker: number;
      speedScale: number;
      presetId?: string;
      onProgress?: (done: number, total: number) => void;
      onNotice?: (message: string) => void;
    },
  ): Promise<ChannelVideoVoice> {
    const narrationDir = path.join(workDir, NARRATION_DIR);
    await fsp.mkdir(narrationDir, { recursive: true });
    const result = await synthesizeNarration({
      workDir: narrationDir,
      chapters,
      voice: resolveNarrationVoice(voice.ref, voice.speedScale),
      ...(voice.onProgress ? { onProgress: voice.onProgress } : {}),
    });

    // The track the current scenes were cut against (the pipeline prefers transcript-updated.srt).
    const previousTrack = await fsp
      .readFile(path.join(workDir, 'transcript-updated.srt'), 'utf8')
      .catch(() => fsp.readFile(path.join(workDir, 'transcript.srt'), 'utf8'))
      .catch(() => null);

    // Keep the source files once, before the first narration overwrites them. A video started from a skill
    // script (Preparing) already has source/ with the source transcript and no source audio: nothing to move,
    // and moving would put this folder's narration track in source/ on the second narration.
    const sourceDir = path.join(workDir, SOURCE_DIR);
    if (!fs.existsSync(path.join(sourceDir, AUDIO_FILE)) && !fs.existsSync(path.join(workDir, PREPARING_MARKER))) {
      await fsp.mkdir(sourceDir, { recursive: true });
      for (const name of [AUDIO_FILE, ...SOURCE_TRANSCRIPTS]) {
        const from = path.join(workDir, name);
        if (fs.existsSync(from)) await fsp.rename(from, path.join(sourceDir, name));
      }
    }
    // The pipeline prefers transcript-updated.srt; the narration's own track must win.
    await fsp.rm(path.join(workDir, 'transcript-updated.srt'), { force: true });
    await fsp.copyFile(result.audioPath, path.join(workDir, AUDIO_FILE));
    await fsp.copyFile(result.subtitlePath, path.join(workDir, 'transcript.srt'));
    const saved: ChannelVideoVoice = {
      speaker: voice.speaker,
      speedScale: voice.speedScale,
      ...(voice.presetId ? { presetId: voice.presetId } : {}),
      durationSec: result.durationSec,
      at: new Date().toISOString(),
    };
    await writeState(workDir, { voice: saved });

    const newTrack = await fsp.readFile(result.subtitlePath, 'utf8');
    const retimed = previousTrack ? await retimeScenePromptsFile(workDir, previousTrack, newTrack) : null;
    const notices: string[] = [];
    if (retimed) {
      const matchedPercent = Math.round(retimed.matchedRatio * 100);
      const promptsGeneratedAt = scenePromptsGeneratedAt(workDir);
      if (retimed.matchedRatio < SCENES_STALE_RATIO && promptsGeneratedAt) {
        await writeState(workDir, { scenesStale: { at: saved.at, matchedPercent, promptsGeneratedAt } });
        notices.push(`Kịch bản đổi nhiều (${matchedPercent}% câu còn giữ): ${retimed.scenes} cảnh đã dời theo giọng mới nhưng ảnh không còn khớp lời, nên tạo lại cảnh.`);
      } else {
        await writeState(workDir, { scenesStale: undefined });
        notices.push(`Đã căn lại ${retimed.scenes} cảnh theo giọng mới (${matchedPercent}% câu giữ nguyên).`);
      }
    }
    if (result.readingChecks.length) {
      notices.push(
        `Nghe lại cách đọc ${result.readingChecks.length} từ (số, tên riêng, chữ Latin): ${result.readingChecks
          .slice(0, 6)
          .map(check => check.term)
          .join('、')}${result.readingChecks.length > 6 ? '…' : ''}.`,
      );
    }
    if (notices.length) voice.onNotice?.(notices.join(' '));
    return saved;
  }

  /**
   * Automatic remake for "Chuẩn bị video" / "Tạo video" on remake channels: remakes `transcriptPath` into
   * script.txt (waits for the ChatGPT/Gemini job), then narrates it with VOICEVOX, all inside the
   * pipeline's work folder (moved to the channel folder afterwards). Returns the narration transcript.
   */
  async autoRemakeFolder(
    workDir: string,
    transcriptPath: string,
    config: RemakeAutoConfig,
    hooks: { log: (message: string) => void; onRemakeDone?: () => void },
    /** Channel and source video, to pick up a script the skill wrote ahead (remake-ready/). */
    source?: { channelId: string; sourceVideoId: string },
  ): Promise<{ subtitlePath: string; voice: ChannelVideoVoice; outline: RemakeOutlineHint }> {
    const ready = await this.useReadyScript(workDir, hooks.log, source);
    const outline = ready?.outline ?? (await this.remakeWithLlm(workDir, transcriptPath, config, hooks.log));
    hooks.onRemakeDone?.();

    this.assertVoiceFree();
    const settings = readVoiceSettings();
    const presetId = config.voicePresetId ?? settings.voicevox.defaultPresetId ?? undefined;
    const preset = presetId ? settings.voicevox.presets.find(item => item.id === presetId) : undefined;
    if (config.voicePresetId && !preset) {
      throw new AppError('Giọng VOICEVOX đã chọn cho kênh không còn — chọn lại ở cài đặt kênh', 400, 'VOICE_PRESET_NOT_FOUND');
    }
    const speaker = preset?.speaker ?? resolveVoicevoxDefaultSpeaker();
    const speedScale = config.speedScale ?? 1;
    hooks.log(`Đọc giọng VOICEVOX (${preset?.name ?? `speaker ${speaker}`}, tốc độ ${speedScale})…`);
    this.autoNarrating = true;
    try {
      const voice = await this.narrateFolder(workDir, readScriptChapters(workDir), {
        ref: { provider: 'voicevox', ...(preset ? { presetId: preset.id } : {}), voicevoxSpeaker: speaker },
        speaker,
        speedScale,
        ...(preset ? { presetId: preset.id } : {}),
        onNotice: hooks.log,
      });
      hooks.log(`Đã thay audio bằng giọng đọc (${Math.round(voice.durationSec)} giây)`);
      // The skill's script now lives in this video's folder; drop it from remake-ready/ only once narrated,
      // so a failed prepare leaves it for the next try.
      if (ready) await fsp.rm(ready.dir, { recursive: true, force: true });
      return { subtitlePath: path.join(workDir, 'transcript.srt'), voice, outline };
    } finally {
      this.autoNarrating = false;
    }
  }

  /**
   * When the nightly skill run already remade this source (remake-ready/, check passed), its script becomes
   * script.txt and its result is written to `remake/` exactly like an LLM remake job (remake-<time>.txt + .json,
   * plus the skill's research notes), so the folder looks the same whichever wrote it. Returns null when there is
   * no usable skill script: the LLM remakes as before. Another script is only made by remaking in the Script tab.
   */
  async useReadyScript(
    workDir: string,
    log: (message: string) => void,
    source?: { channelId: string; sourceVideoId: string },
  ): Promise<{ outline: RemakeOutlineHint; dir: string } | null> {
    if (!source) return null;
    const ready = findReadyScript(source.channelId, source.sourceVideoId);
    if (ready.status !== 'ready') {
      if (ready.status !== 'missing') log(`Không dùng kịch bản skill viết sẵn: ${ready.reason} — remake bằng LLM`);
      return null;
    }
    const { title, chapters } = parseScriptText(ready.text);
    if (chapters.length === 0) {
      log('Kịch bản skill viết sẵn trống — remake bằng LLM');
      return null;
    }

    const { meta, check } = ready;
    const finalTitle = title || meta.title || source.sourceVideoId;
    const totalChars = chapters.reduce((sum, chapter) => sum + chapter.sentences.join('').length, 0);
    const estimatedMinutes = Math.round((totalChars / REMAKE_CHARS_PER_MIN) * 10) / 10;
    const plannedMinutes = meta.minutes ?? Math.round(estimatedMinutes);
    const lengthReason = meta.lengthReason ?? 'Kịch bản do skill jp-psy-script-remake viết sẵn (lý do chọn góc và nguồn trong file .research.md cùng tên).';
    const outline: RemakeOutline = {
      title: finalTitle,
      angle: meta.angle ?? '',
      hook: meta.hook ?? '',
      story: meta.story ?? '',
      targetMinutes: plannedMinutes,
      lengthReason,
      chapters: chapters.map(chapter => ({ heading: chapter.heading, keyPoints: [] })),
    };

    const outputDir = path.join(workDir, 'remake');
    await fsp.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `remake-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
    const result: RemakeResult = {
      outline,
      chapters,
      plannedMinutes,
      lengthReason,
      totalChars,
      estimatedMinutes,
      similarity: {
        gram8: Math.max(0, ...check.sources.map(item => item.gram8)),
        gram15: Math.max(0, ...check.sources.map(item => item.gram15)),
      },
      qualityWarnings: [],
      outputPath,
      relativeOutputPath: path.relative(paths.dataDir, outputPath).split(path.sep).join('/'),
    };
    await fsp.writeFile(outputPath, remakeText(outline, chapters), 'utf8');
    await fsp.writeFile(
      outputPath.replace(/\.txt$/, '.json'),
      JSON.stringify({ ...result, writtenBy: 'skill:jp-psy-script-remake', skillMeta: meta, skillCheck: check }, null, 2),
      'utf8',
    );
    const research = path.join(ready.dir, 'research.md');
    if (fs.existsSync(research)) await fsp.copyFile(research, outputPath.replace(/\.txt$/, '.research.md'));

    await fsp.writeFile(path.join(workDir, SCRIPT_FILE), scriptToText(finalTitle, chapters), 'utf8');
    await writeState(workDir, { skillScript: { checkedAt: check.checkedAt, topicKey: meta.topicKey ?? '' } });
    log(`Dùng kịch bản skill viết sẵn (kiểm ĐẠT ${check.checkedAt.slice(0, 10)}): "${finalTitle}" — ${chapters.length} chương, ~${estimatedMinutes} phút`);
    return { outline: { title: finalTitle, angle: outline.angle, hook: outline.hook }, dir: ready.dir };
  }

  private async remakeWithLlm(
    workDir: string,
    transcriptPath: string,
    config: RemakeAutoConfig,
    log: (message: string) => void,
  ): Promise<RemakeOutlineHint> {
    if (scriptRemakeService.isBusy()) {
      throw new AppError('Đang có một lượt remake khác chạy — chờ xong rồi chuẩn bị lại', 409, 'REMAKE_BUSY');
    }
    const started = await scriptRemakeService.start({
      transcript: await fsp.readFile(transcriptPath, 'utf8'),
      outputDir: path.join(workDir, 'remake'),
      language: 'ja',
      ...(config.promptSetId ? { promptSetId: config.promptSetId } : {}),
      ...(config.provider ? { provider: config.provider } : {}),
    });
    await writeState(workDir, { remakeJobId: started.id });
    log(`Remake kịch bản (${started.provider}, bộ prompt "${started.promptSetName ?? '?'}")…`);
    const job = await scriptRemakeService.wait(started.id);
    if (job.status !== 'done' || !job.result) {
      throw new AppError(`Remake kịch bản thất bại: ${job.error ?? 'không có kết quả'}`, 502, 'REMAKE_FAILED');
    }
    await fsp.writeFile(path.join(workDir, SCRIPT_FILE), scriptToText(job.result.outline.title, job.result.chapters), 'utf8');
    log(`Kịch bản mới: "${job.result.outline.title}" — ${job.result.chapters.length} chương, ~${job.result.estimatedMinutes} phút`);
    const { title, angle, hook } = job.result.outline;
    return { title, angle, hook };
  }
}

type ScriptChapters = ReturnType<typeof parseScriptText>['chapters'];

function readScriptChapters(workDir: string): ScriptChapters {
  const scriptFile = path.join(workDir, SCRIPT_FILE);
  const { chapters } = parseScriptText(fs.existsSync(scriptFile) ? fs.readFileSync(scriptFile, 'utf8') : '');
  if (chapters.length === 0) throw new AppError('Chưa có kịch bản — remake hoặc soạn ở tab Kịch bản trước', 409, 'STAGE_ORDER');
  return chapters;
}

export const channelVideoRemakeService = new ChannelVideoRemakeService();
