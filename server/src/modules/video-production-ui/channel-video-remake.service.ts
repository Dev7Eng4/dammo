import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../shared/http/errors.js';
import type { LlmTextProvider } from '../llm-browser/core/types.js';
import { parseScriptText, scriptToText } from '../manual-video/manual-video.service.js';
import { scriptRemakeService, type RemakeJob } from '../script-remake/script-remake.service.js';
import { synthesizeNarration } from '../video-agent/narration.js';
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
const NARRATION_DIR = 'narration';
const AUDIO_FILE = 'audio.mp3';
const SOURCE_TRANSCRIPTS = ['transcript-updated.srt', 'transcript.srt'];

export interface ChannelVideoVoice {
  speaker: number;
  speedScale: number;
  durationSec: number;
  at: string;
}

interface RemakeState {
  remakeJobId?: string;
  voice?: ChannelVideoVoice;
}

export interface ChannelVideoVoiceJob {
  status: 'running' | 'done' | 'failed';
  progress?: string;
  error?: string;
}

export interface ChannelVideoScriptResponse {
  text: string;
  chars: number;
  remakeJobId?: string;
  /** Narration currently in audio.mp3; unset while the video still has the source audio. */
  voice?: ChannelVideoVoice;
  voiceJob?: ChannelVideoVoiceJob;
  /** The source audio was replaced by a narration (kept in `source/`). */
  sourceReplaced: boolean;
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
    return {
      text,
      chars: parseScriptText(text).chapters.reduce((sum, chapter) => sum + chapter.sentences.join('').length, 0),
      ...(state.remakeJobId ? { remakeJobId: state.remakeJobId } : {}),
      ...(state.voice ? { voice: state.voice } : {}),
      ...(voiceJob ? { voiceJob } : {}),
      sourceReplaced: fs.existsSync(path.join(workDir, SOURCE_DIR, AUDIO_FILE)),
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
    return this.getScript(channelId, videoId);
  }

  /**
   * Reads script.txt with VOICEVOX in the background. The source audio/transcripts move to `source/`
   * the first time; audio.mp3 and transcript.srt then hold the narration. Scenes keep their old timing,
   * so they should be created again afterwards.
   */
  startVoice(channelId: string, videoId: string, input: { speaker: number; speedScale: number }): ChannelVideoScriptResponse {
    requireRemakeChannel(channelId);
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
          ref: { voicevoxSpeaker: input.speaker },
          speaker: input.speaker,
          speedScale: input.speedScale,
          onProgress: (done, total) => {
            job.progress = `${done}/${total}`;
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
   * run on it unchanged.
   */
  private async narrateFolder(
    workDir: string,
    chapters: ScriptChapters,
    voice: { ref: NarrationVoiceRef; speaker: number; speedScale: number; onProgress?: (done: number, total: number) => void },
  ): Promise<ChannelVideoVoice> {
    const narrationDir = path.join(workDir, NARRATION_DIR);
    await fsp.mkdir(narrationDir, { recursive: true });
    const result = await synthesizeNarration({
      workDir: narrationDir,
      chapters,
      voice: resolveNarrationVoice(voice.ref, voice.speedScale),
      ...(voice.onProgress ? { onProgress: voice.onProgress } : {}),
    });

    // Keep the source files once, before the first narration overwrites them.
    const sourceDir = path.join(workDir, SOURCE_DIR);
    if (!fs.existsSync(path.join(sourceDir, AUDIO_FILE))) {
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
      durationSec: result.durationSec,
      at: new Date().toISOString(),
    };
    await writeState(workDir, { voice: saved });
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
  ): Promise<{ subtitlePath: string; voice: ChannelVideoVoice }> {
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
    hooks.log(`Remake kịch bản (${started.provider}, bộ prompt "${started.promptSetName ?? '?'}")…`);
    const job = await scriptRemakeService.wait(started.id);
    if (job.status !== 'done' || !job.result) {
      throw new AppError(`Remake kịch bản thất bại: ${job.error ?? 'không có kết quả'}`, 502, 'REMAKE_FAILED');
    }
    await fsp.writeFile(path.join(workDir, SCRIPT_FILE), scriptToText(job.result.outline.title, job.result.chapters), 'utf8');
    hooks.log(
      `Kịch bản mới: "${job.result.outline.title}" — ${job.result.chapters.length} chương, ~${job.result.estimatedMinutes} phút`,
    );
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
      });
      hooks.log(`Đã thay audio bằng giọng đọc (${Math.round(voice.durationSec)} giây)`);
      return { subtitlePath: path.join(workDir, 'transcript.srt'), voice };
    } finally {
      this.autoNarrating = false;
    }
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
