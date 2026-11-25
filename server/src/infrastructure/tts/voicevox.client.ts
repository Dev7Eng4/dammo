import { AppError } from '../../shared/http/errors.js';
import { resolveVoicevoxUrl } from './voice-settings.store.js';

export interface VoicevoxStyle {
  id: number;
  name: string;
}

export interface VoicevoxSpeaker {
  name: string;
  styles: VoicevoxStyle[];
}

export interface VoicevoxSynthOptions {
  speaker: number;
  /** 1.0 = engine default. */
  speedScale?: number;
  /** Pitch shift, -0.15..0.15 (0 = engine default). */
  pitchScale?: number;
  /** Intonation strength, 0..2 (1 = engine default). */
  intonationScale?: number;
  /** Loudness, 0..2 (1 = engine default). */
  volumeScale?: number;
  /** Silence appended after the utterance, in seconds. */
  postPhonemeLength?: number;
  /** Multiplies the engine's pauses at 、 (1.0 = engine default). */
  pauseLengthScale?: number;
  /** Short breath inserted at phrase boundaries inside long comma-free stretches, in seconds. */
  phraseBreathSec?: number;
}

/** Moras after which a narrator naturally takes a breath: topic は (ワ), が, and the て/で connective. */
const BREATH_AFTER = new Set(['ワ', 'ガ', 'テ', 'デ']);
const BREATH_MIN_RUN_MORAS = 12;
const BREATH_MIN_TAIL_MORAS = 6;

interface Mora {
  text: string;
  consonant_length?: number | null;
  vowel_length?: number | null;
}

interface AccentPhrase {
  moras: Mora[];
  pause_mora?: Mora | null;
}

/**
 * Where speech and pauses fall inside one synthesized utterance, from the engine's own phoneme lengths
 * (seconds, before the engine rounds them to frames: scale by real WAV length / `totalSec`).
 */
export interface SpeechTiming {
  totalSec: number;
  speechStartSec: number;
  speechEndSec: number;
  /** Pauses the engine put at punctuation (、。！？…), in text order. Breaths from addPhraseBreaths are left out. */
  pauses: { startSec: number; endSec: number }[];
}

/**
 * Adds a pause after a particle once a stretch has run BREATH_MIN_RUN_MORAS without one, the way a
 * narrator breathes inside a long clause. Never right before the end of the sentence.
 */
function addPhraseBreaths(phrases: AccentPhrase[], seconds: number): Set<number> {
  const added = new Set<number>();
  const total = phrases.reduce((sum, phrase) => sum + phrase.moras.length, 0);
  let sincePause = 0;
  let spoken = 0;
  for (const [index, phrase] of phrases.entries()) {
    sincePause += phrase.moras.length;
    spoken += phrase.moras.length;
    if (phrase.pause_mora) {
      sincePause = 0;
      continue;
    }
    const last = phrase.moras[phrase.moras.length - 1]?.text ?? '';
    if (
      index < phrases.length - 1 &&
      sincePause >= BREATH_MIN_RUN_MORAS &&
      total - spoken >= BREATH_MIN_TAIL_MORAS &&
      BREATH_AFTER.has(last)
    ) {
      phrase.pause_mora = { text: '、', consonant: null, consonant_length: null, vowel: 'pau', vowel_length: seconds, pitch: 0 } as Mora;
      added.add(index);
      sincePause = 0;
    }
  }
  return added;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Same arithmetic as the engine: pre/post silence and pauses (× pauseLengthScale), all ÷ speedScale. */
function speechTiming(query: Record<string, unknown>, breaths: Set<number>): SpeechTiming {
  const speed = num(query.speedScale, 1) || 1;
  const pauseScale = num(query.pauseLengthScale, 1);
  const fixedPause = typeof query.pauseLength === 'number' ? query.pauseLength : null;
  const phrases = (Array.isArray(query.accent_phrases) ? query.accent_phrases : []) as AccentPhrase[];
  let t = num(query.prePhonemeLength, 0.1) / speed;
  const speechStartSec = t;
  const pauses: SpeechTiming['pauses'] = [];
  for (const [index, phrase] of phrases.entries()) {
    for (const mora of phrase.moras) t += (num(mora.consonant_length, 0) + num(mora.vowel_length, 0)) / speed;
    if (phrase.pause_mora) {
      const length = ((fixedPause ?? num(phrase.pause_mora.vowel_length, 0)) * pauseScale) / speed;
      if (!breaths.has(index)) pauses.push({ startSec: t, endSec: t + length });
      t += length;
    }
  }
  const speechEndSec = t;
  t += num(query.postPhonemeLength, 0.1) / speed;
  return { totalSec: t, speechStartSec, speechEndSec, pauses };
}

function baseUrl(): string {
  return resolveVoicevoxUrl();
}

async function request(pathname: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${pathname}`, init);
  } catch (err) {
    throw new AppError(
      `Không kết nối được VOICEVOX Engine tại ${baseUrl()} — hãy mở VOICEVOX trước (${err instanceof Error ? err.message : err})`,
      503,
      'VOICEVOX_UNAVAILABLE',
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new AppError(`VOICEVOX ${pathname} lỗi ${res.status}: ${body.slice(0, 300)}`, 502, 'VOICEVOX_ERROR');
  }
  return res;
}

export async function getVoicevoxVersion(): Promise<string> {
  const res = await request('/version');
  return (await res.json()) as string;
}

export async function listVoicevoxSpeakers(): Promise<VoicevoxSpeaker[]> {
  const res = await request('/speakers');
  const raw = (await res.json()) as Array<{ name: string; styles: Array<{ id: number; name: string }> }>;
  return raw.map(speaker => ({
    name: speaker.name,
    styles: speaker.styles.map(style => ({ id: style.id, name: style.name })),
  }));
}

async function buildQuery(text: string, options: VoicevoxSynthOptions) {
  const queryRes = await request(
    `/audio_query?${new URLSearchParams({ text, speaker: String(options.speaker) })}`,
    { method: 'POST' },
  );
  const query = (await queryRes.json()) as Record<string, unknown>;
  if (options.speedScale !== undefined) query.speedScale = options.speedScale;
  if (options.pitchScale !== undefined) query.pitchScale = options.pitchScale;
  if (options.intonationScale !== undefined) query.intonationScale = options.intonationScale;
  if (options.volumeScale !== undefined) query.volumeScale = options.volumeScale;
  if (options.postPhonemeLength !== undefined) query.postPhonemeLength = options.postPhonemeLength;
  if (options.pauseLengthScale !== undefined) query.pauseLengthScale = options.pauseLengthScale;
  const breaths =
    options.phraseBreathSec && Array.isArray(query.accent_phrases)
      ? addPhraseBreaths(query.accent_phrases as AccentPhrase[], options.phraseBreathSec)
      : new Set<number>();
  return { query, breaths };
}

/** Text → 16-bit mono WAV bytes (engine sampling rate, 24 kHz by default). */
export async function synthesizeVoicevox(text: string, options: VoicevoxSynthOptions): Promise<Buffer> {
  return (await synthesizeVoicevoxTimed(text, options)).wav;
}

/** Like synthesizeVoicevox, plus where each pause falls (for exact subtitle cues inside a sentence). */
export async function synthesizeVoicevoxTimed(
  text: string,
  options: VoicevoxSynthOptions,
): Promise<{ wav: Buffer; timing: SpeechTiming }> {
  const { query, breaths } = await buildQuery(text, options);
  const wavRes = await request(`/synthesis?${new URLSearchParams({ speaker: String(options.speaker) })}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  });
  return { wav: Buffer.from(await wavRes.arrayBuffer()), timing: speechTiming(query, breaths) };
}

/** Timing of an utterance without synthesizing it (audio_query only), for sentences whose WAV is cached. */
export async function voicevoxSpeechTiming(text: string, options: VoicevoxSynthOptions): Promise<SpeechTiming> {
  const { query, breaths } = await buildQuery(text, options);
  return speechTiming(query, breaths);
}

/**
 * How VOICEVOX will read `text`, in katakana: accent phrases separated by spaces, pauses as 、.
 * Used to check numbers and names before narrating.
 */
export async function voicevoxReading(text: string, speaker: number): Promise<string> {
  const { query } = await buildQuery(text, { speaker });
  const phrases = (Array.isArray(query.accent_phrases) ? query.accent_phrases : []) as AccentPhrase[];
  return phrases
    .map(phrase => phrase.moras.map(mora => mora.text).join('') + (phrase.pause_mora ? '、' : ''))
    .join(' ')
    .replace(/ 、/g, '、')
    .trim();
}
