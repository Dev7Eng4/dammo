import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { runFfmpeg } from '../../infrastructure/ffmpeg/ffmpeg-runner.js';
import { serializeSrt, type SrtBlock } from '../../infrastructure/subtitle/srt-utils.js';
import { synthesizeVoicevox } from '../../infrastructure/tts/voicevox.client.js';
import { encodeWav, parseWav, silencePcm, wavDurationSec, type PcmWav } from '../../infrastructure/tts/wav.js';
import type { VideoAgentScriptChapter } from './video-agent.types.js';

/**
 * Pacing measured on reference narration channels for this audience (~270 chars/min, about a third of
 * the track silent, median pause ~0.65 s) versus the old settings (~380 chars/min, 15 % silent, no pause
 * over 0.55 s, which reads as one breathless stream). The values below bring VOICEVOX to ~300 chars/min,
 * ~28 % silence and a ~0.67 s median pause.
 */
export const NARRATION_PACING = {
  /** VOICEVOX speedScale at the producer's ×1; the producer's choice multiplies it. */
  baseSpeed: 0.92,
  /** Pauses at 、 relative to the engine default. */
  commaPauseScale: 1.5,
  /** Breath inside long comma-free stretches (see voicevox.client.ts). */
  phraseBreathSec: 0.28,
  sentencePauseSec: 0.8,
  /** After a question the listener needs a moment to answer it in their head. */
  questionPauseSec: 1.15,
  /** A short line is usually a punchline or a turn; let it land. */
  shortSentencePauseSec: 1.0,
  shortSentenceChars: 14,
  chapterPauseSec: 2.0,
} as const;
/** Bumped whenever the pacing changes so cached sentence WAVs are re-synthesized. */
const PACING_VERSION = 2;

/** Silence after a sentence, from what kind of sentence it is. */
export function sentencePauseSec(sentence: string): number {
  const trimmed = sentence.trim();
  if (/[？?]$|(か|ませんか|でしょうか)[。．]?$/.test(trimmed)) return NARRATION_PACING.questionPauseSec;
  if (trimmed.replace(/[、。！？!?「」]/g, '').length <= NARRATION_PACING.shortSentenceChars) {
    return NARRATION_PACING.shortSentencePauseSec;
  }
  return NARRATION_PACING.sentencePauseSec;
}

/** VOICEVOX options for one narration sentence (also used by the voice preview so it sounds the same). */
export function narrationVoiceOptions(speaker: number, speedScale: number, postPhonemeLength?: number) {
  return {
    speaker,
    speedScale: speedScale * NARRATION_PACING.baseSpeed,
    pauseLengthScale: NARRATION_PACING.commaPauseScale,
    phraseBreathSec: NARRATION_PACING.phraseBreathSec,
    ...(postPhonemeLength !== undefined ? { postPhonemeLength } : {}),
  };
}
/** Longest caption line before a sentence is split at 、 for the subtitle track. */
const MAX_CAPTION_CHARS = 28;

export interface NarrationResult {
  audioPath: string;
  subtitlePath: string;
  durationSec: number;
  sentenceCount: number;
  /** Spoken length of each chapter, chapter pauses excluded. */
  chapterSeconds: number[];
}

function srtTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
}

/** Splits at 、 into lines of at most MAX_CAPTION_CHARS, never mid-clause unless a clause is itself too long. */
export function splitCaption(sentence: string): string[] {
  if (sentence.length <= MAX_CAPTION_CHARS) return [sentence];
  const clauses = sentence.split(/(?<=、)/);
  const lines: string[] = [];
  let current = '';
  for (const clause of clauses) {
    if (current && (current + clause).length > MAX_CAPTION_CHARS) {
      lines.push(current);
      current = '';
    }
    current += clause;
    while (current.length > MAX_CAPTION_CHARS * 1.5) {
      lines.push(current.slice(0, MAX_CAPTION_CHARS));
      current = current.slice(MAX_CAPTION_CHARS);
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Speaking rate (pauses at 、 included, sentence pauses not) at VOICEVOX speedScale 1, to estimate timing before any audio exists. */
const ESTIMATED_CHARS_PER_SEC = 7.6;

/**
 * Subtitle track with estimated timing, built from the script alone. It lets scenes and images be made
 * before the voice: cues are split exactly as `synthesizeNarration` splits them, so once the real audio
 * exists every cue has a counterpart and the scenes can be re-timed onto it (see scene-retime.ts).
 */
export async function writeProvisionalSubtitle(params: {
  workDir: string;
  chapters: VideoAgentScriptChapter[];
  speedScale: number;
}): Promise<string> {
  const blocks: SrtBlock[] = [];
  let cursor = 0;
  for (const [chapterIndex, chapter] of params.chapters.entries()) {
    for (const sentence of chapter.sentences) {
      const lines = splitCaption(sentence);
      for (const line of lines) {
        const duration = line.length / (ESTIMATED_CHARS_PER_SEC * params.speedScale * NARRATION_PACING.baseSpeed);
        blocks.push({ index: blocks.length + 1, start: srtTime(cursor), end: srtTime(cursor + duration), text: line });
        cursor += duration;
      }
      cursor += sentencePauseSec(sentence);
    }
    if (chapterIndex < params.chapters.length - 1) cursor += NARRATION_PACING.chapterPauseSec;
  }
  await fs.mkdir(params.workDir, { recursive: true });
  const subtitlePath = path.join(params.workDir, 'transcript-provisional.srt');
  await fs.writeFile(subtitlePath, serializeSrt(blocks), 'utf8');
  return subtitlePath;
}

/**
 * Speaks the script sentence by sentence. Timing comes from the synthesized audio itself,
 * so the SRT is exact without a speech-recognition pass. Sentence WAVs are cached by content,
 * so re-running after a script tweak only synthesizes the changed sentences.
 */
export async function synthesizeNarration(params: {
  workDir: string;
  chapters: VideoAgentScriptChapter[];
  speaker: number;
  speedScale: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}): Promise<NarrationResult> {
  const voiceDir = path.join(params.workDir, 'voice');
  await fs.mkdir(voiceDir, { recursive: true });

  const total = params.chapters.reduce((sum, chapter) => sum + chapter.sentences.length, 0);
  const pcmChunks: Buffer[] = [];
  const blocks: SrtBlock[] = [];
  let format: PcmWav | null = null;
  let cursor = 0;
  let done = 0;
  const chapterSeconds: number[] = [];

  for (const [chapterIndex, chapter] of params.chapters.entries()) {
    const chapterStart = cursor;
    for (const sentence of chapter.sentences) {
      params.signal?.throwIfAborted();
      const pause = sentencePauseSec(sentence);
      const key = crypto
        .createHash('sha1')
        .update(`v${PACING_VERSION}|${params.speaker}|${params.speedScale}|${pause}|${sentence}`)
        .digest('hex')
        .slice(0, 16);
      const wavPath = path.join(voiceDir, `${key}.wav`);

      let wavBytes: Buffer;
      try {
        wavBytes = await fs.readFile(wavPath);
      } catch {
        wavBytes = await synthesizeVoicevox(sentence, narrationVoiceOptions(params.speaker, params.speedScale, pause));
        await fs.writeFile(wavPath, wavBytes);
      }

      const wav = parseWav(wavBytes);
      format ??= wav;
      const duration = wavDurationSec(wav);
      pcmChunks.push(wav.data);

      // Captions cover the spoken part only, split proportionally to characters.
      const spoken = Math.max(0.3, duration - pause);
      const lines = splitCaption(sentence);
      const chars = lines.reduce((sum, line) => sum + line.length, 0);
      let lineStart = cursor;
      for (const line of lines) {
        const lineDuration = (spoken * line.length) / chars;
        blocks.push({
          index: blocks.length + 1,
          start: srtTime(lineStart),
          end: srtTime(lineStart + lineDuration),
          text: line,
        });
        lineStart += lineDuration;
      }

      cursor += duration;
      params.onProgress?.(++done, total);
    }
    chapterSeconds.push(cursor - chapterStart);

    if (format && chapterIndex < params.chapters.length - 1) {
      pcmChunks.push(silencePcm(format, NARRATION_PACING.chapterPauseSec));
      cursor += NARRATION_PACING.chapterPauseSec;
    }
  }

  if (!format) throw new Error('Kịch bản không có câu nào để đọc');

  const wavPath = path.join(params.workDir, 'narration.wav');
  const audioPath = path.join(params.workDir, 'audio.mp3');
  const subtitlePath = path.join(params.workDir, 'transcript.srt');
  await fs.writeFile(wavPath, encodeWav(format, pcmChunks));
  await runFfmpeg(['-hide_banner', '-y', '-i', wavPath, '-c:a', 'libmp3lame', '-b:a', '192k', audioPath], {
    label: 'video-agent-narration',
    encoderFallback: false,
  });
  await fs.writeFile(subtitlePath, serializeSrt(blocks), 'utf8');

  return { audioPath, subtitlePath, durationSec: cursor, sentenceCount: total, chapterSeconds };
}
