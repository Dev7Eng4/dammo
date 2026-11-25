import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { runFfmpeg } from '../../infrastructure/ffmpeg/ffmpeg-runner.js';
import { serializeSrt, type SrtBlock } from '../../infrastructure/subtitle/srt-utils.js';
import type { SpeechTiming } from '../../infrastructure/tts/voicevox.client.js';
import { encodeWav, parseWav, silencePcm, wavDurationSec, type PcmWav } from '../../infrastructure/tts/wav.js';
import { splitCaptionSentence } from '../video-production/shared/render-core/caption-segment.js';
import type { NarrationVoice } from '../voice/narration-voice.js';
import { applyNarrationReadings, findRiskyTerms, readNarrationReadings, type RiskyTerm } from '../voice/narration-readings.js';
import { recordNarrationVoice } from '../voice/voicevox-credit.js';
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
/** Longest caption line before a sentence is split (at 、, else at a natural word break) for the subtitle track. */
const MAX_CAPTION_CHARS = 28;
/** A caption shown shorter than this cannot be read; it borrows time from its neighbour or the pause after it. */
const MIN_CUE_SEC = 1.0;
/** At most this much is borrowed from the next line of the same sentence. */
const MAX_BORROW_SEC = 0.4;
/** The last line of a sentence stays this long into the pause, so captions do not blink between sentences. */
const SENTENCE_HOLD_SEC = 0.4;

export interface NarrationResult {
  audioPath: string;
  subtitlePath: string;
  durationSec: number;
  sentenceCount: number;
  /** Spoken length of each chapter, chapter pauses excluded. */
  chapterSeconds: number[];
  /** Numbers, names and Latin words in the script, and how the voice read them: listen to these. */
  readingChecks: ReadingCheck[];
}

/** One word to listen to, with the first sentence it appears in. */
export interface ReadingCheck {
  term: string;
  kind: RiskyTerm['kind'];
  /** Sentences it appears in. */
  count: number;
  sentence: string;
  /** Katakana the engine read for that sentence (VOICEVOX only), after the reading dictionary. */
  reading?: string;
}

export const READING_CHECKS_FILE = 'readings-check.json';

function srtTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
}

/** Splits at 、 into lines of at most MAX_CAPTION_CHARS, else at the most natural word break near the middle. */
export function splitCaption(sentence: string): string[] {
  return splitCaptionSentence(sentence, MAX_CAPTION_CHARS);
}

const SMALL_KANA = /[ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ]/;
/** Punctuation the engine turns into a pause (it pauses at quote marks and at ・ too). */
const PAUSE_MARK = /[、。，．,.！？!?…「」『』・]/;
const CLOSING_MARK = /[」』）)】〉》”’]/;

/** Rough spoken length of one character, in moras: kanji read ~2, small kana merge into the previous one. */
function charWeight(ch: string, pauseWeight: number): number {
  if (PAUSE_MARK.test(ch)) return pauseWeight;
  if (SMALL_KANA.test(ch)) return 0;
  if (/\p{Script=Han}/u.test(ch)) return 1.8;
  if (/[\p{Script=Hiragana}\p{Script=Katakana}ー]/u.test(ch)) return 1;
  if (/[0-9０-９]/.test(ch)) return 1.5;
  if (/[A-Za-zＡ-Ｚａ-ｚ]/.test(ch)) return 0.8;
  return 0;
}

/**
 * Start/end (seconds from the start of the sentence's audio) of each caption line of one sentence.
 * With the engine's timing, each line boundary after 、 sits exactly where speech resumes after that
 * pause; inside a clause, time is split by estimated moras. Without it (ElevenLabs, or a pause count that
 * does not match the punctuation), the spoken part is split by estimated moras, 、 counted as a pause.
 */
export function captionCueTimes(
  sentence: string,
  lines: string[],
  durationSec: number,
  pauseSec: number,
  timing?: SpeechTiming,
): Array<[number, number]> {
  const chars = Array.from(sentence);
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    const first = Array.from(line)[0];
    const at = first === undefined ? -1 : chars.indexOf(first, offset);
    const start = at === -1 ? offset : at;
    starts.push(start);
    offset = start + Array.from(line).length;
  }

  // Punctuation runs inside the sentence (not the one ending it): one engine pause each.
  const clusters: Array<[number, number]> = [];
  for (let i = 0; i < chars.length; i++) {
    if (!PAUSE_MARK.test(chars[i])) continue;
    let end = i;
    while (end < chars.length && PAUSE_MARK.test(chars[end])) end++;
    const before = chars.slice(0, i).join('');
    const rest = chars.slice(end).join('');
    const marks = new RegExp(`${PAUSE_MARK.source}|${CLOSING_MARK.source}`, 'g');
    // No pause before the first word (an opening 「) or after the last one.
    if (before.replace(marks, '').trim() && rest.replace(marks, '').trim()) clusters.push([i, end]);
    i = end - 1;
  }

  const exact = !!timing && timing.totalSec > 0 && timing.pauses.length === clusters.length;
  const weights = chars.map(ch => charWeight(ch, exact ? 0 : 1.2));
  const cumulative = [0];
  for (const weight of weights) cumulative.push(cumulative[cumulative.length - 1] + weight);

  let anchors: Array<[number, number]>;
  let speechEnd: number;
  if (exact && timing) {
    const k = durationSec / timing.totalSec;
    speechEnd = timing.speechEndSec * k;
    anchors = [[0, timing.speechStartSec * k]];
    clusters.forEach(([from, to], index) => {
      anchors.push([from, timing.pauses[index].startSec * k], [to, timing.pauses[index].endSec * k]);
    });
    anchors.push([chars.length, speechEnd]);
  } else {
    speechEnd = Math.max(0.3, durationSec - pauseSec);
    anchors = [[0, 0], [chars.length, speechEnd]];
  }

  const timeAt = (index: number): number => {
    let i = 0;
    while (i + 1 < anchors.length && anchors[i + 1][0] <= index) i++;
    const [c0, t0] = anchors[i];
    const next = anchors[i + 1];
    if (!next) return t0;
    const span = cumulative[next[0]] - cumulative[c0];
    return span <= 0 ? t0 : t0 + ((next[1] - t0) * (cumulative[index] - cumulative[c0])) / span;
  };

  const bounds = starts.map((start, index) => (index === 0 ? anchors[0][1] : timeAt(start)));
  bounds.push(speechEnd);
  for (let i = 1; i < bounds.length; i++) bounds[i] = Math.max(bounds[i], bounds[i - 1]);

  // Too-short lines borrow from the next line of the sentence, if it can spare it.
  for (let i = 0; i < lines.length - 1; i++) {
    const short = MIN_CUE_SEC - (bounds[i + 1] - bounds[i]);
    const spare = bounds[i + 2] - bounds[i + 1] - MIN_CUE_SEC;
    if (short > 0 && spare > 0) bounds[i + 1] += Math.min(short, spare, MAX_BORROW_SEC);
  }
  const cues = lines.map((_, i) => [bounds[i], bounds[i + 1]] as [number, number]);
  const last = cues[cues.length - 1];
  if (last) {
    const latest = Math.max(last[1], durationSec - 0.1);
    last[1] = Math.min(latest, Math.max(last[1] + SENTENCE_HOLD_SEC, last[0] + MIN_CUE_SEC));
  }
  return cues;
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
  /** Saved VOICEVOX / ElevenLabs voice (or a bare VOICEVOX speaker), see resolveNarrationVoice. */
  voice: NarrationVoice;
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
  const readings = readNarrationReadings();
  const readingChecks: ReadingCheck[] = [];

  for (const [chapterIndex, chapter] of params.chapters.entries()) {
    const chapterStart = cursor;
    for (const sentence of chapter.sentences) {
      params.signal?.throwIfAborted();
      const pause = sentencePauseSec(sentence);
      // The voice reads dictionary words as their katakana; captions keep the script's text.
      const spokenText = applyNarrationReadings(sentence, readings);
      const key = crypto
        .createHash('sha1')
        .update(`v${PACING_VERSION}|${params.voice.cacheKey}|${pause}|${spokenText}`)
        .digest('hex')
        .slice(0, 16);
      const wavPath = path.join(voiceDir, `${key}.wav`);
      const timingPath = path.join(voiceDir, `${key}.timing.json`);

      let wavBytes: Buffer;
      let timing: SpeechTiming | undefined;
      try {
        wavBytes = await fs.readFile(wavPath);
        timing = await fs
          .readFile(timingPath, 'utf8')
          .then(raw => JSON.parse(raw) as SpeechTiming)
          .catch(() => undefined);
      } catch {
        const result = await params.voice.synthesize(spokenText, pause);
        wavBytes = result.wav;
        timing = result.timing;
        await fs.writeFile(wavPath, wavBytes);
        if (timing) await fs.writeFile(timingPath, JSON.stringify(timing), 'utf8');
      }
      // Audio cached before timing was kept: ask the engine again (no synthesis).
      if (!timing && params.voice.timing) {
        timing = await params.voice.timing(spokenText, pause).catch(() => undefined);
        if (timing) await fs.writeFile(timingPath, JSON.stringify(timing), 'utf8');
      }

      for (const term of findRiskyTerms(sentence, readings)) {
        const seen = readingChecks.find(check => check.term === term.text);
        if (seen) {
          seen.count += 1;
          continue;
        }
        const reading = params.voice.reading ? await params.voice.reading(spokenText).catch(() => undefined) : undefined;
        readingChecks.push({ term: term.text, kind: term.kind, count: 1, sentence, ...(reading ? { reading } : {}) });
      }

      const wav = parseWav(wavBytes);
      format ??= wav;
      const duration = wavDurationSec(wav);
      pcmChunks.push(wav.data);

      // Captions cover the spoken part, each line from where its words are actually said.
      const lines = splitCaption(sentence);
      const cueTimes = captionCueTimes(sentence, lines, duration, pause, timing);
      for (const [index, line] of lines.entries()) {
        const [start, end] = cueTimes[index];
        blocks.push({ index: blocks.length + 1, start: srtTime(cursor + start), end: srtTime(cursor + end), text: line });
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
  await fs.writeFile(path.join(params.workDir, READING_CHECKS_FILE), JSON.stringify(readingChecks, null, 2), 'utf8');

  // Which voice read this narration: the description needs the VOICEVOX credit line.
  await recordNarrationVoice(params.workDir, params.voice);
  return { audioPath, subtitlePath, durationSec: cursor, sentenceCount: total, chapterSeconds, readingChecks };
}
