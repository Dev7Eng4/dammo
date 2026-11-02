import { env } from '../../config/env.js';
import { AppError } from '../../shared/http/errors.js';

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

interface AccentPhrase {
  moras: { text: string }[];
  pause_mora?: unknown;
}

/**
 * Adds a pause after a particle once a stretch has run BREATH_MIN_RUN_MORAS without one, the way a
 * narrator breathes inside a long clause. Never right before the end of the sentence.
 */
function addPhraseBreaths(phrases: AccentPhrase[], seconds: number): void {
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
      phrase.pause_mora = { text: '、', consonant: null, consonant_length: null, vowel: 'pau', vowel_length: seconds, pitch: 0 };
      sincePause = 0;
    }
  }
}

function baseUrl(): string {
  return env.voicevoxUrl.replace(/\/+$/, '');
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

/** Text → 16-bit mono WAV bytes (engine sampling rate, 24 kHz by default). */
export async function synthesizeVoicevox(text: string, options: VoicevoxSynthOptions): Promise<Buffer> {
  const queryRes = await request(
    `/audio_query?${new URLSearchParams({ text, speaker: String(options.speaker) })}`,
    { method: 'POST' },
  );
  const query = (await queryRes.json()) as Record<string, unknown>;
  if (options.speedScale !== undefined) query.speedScale = options.speedScale;
  if (options.postPhonemeLength !== undefined) query.postPhonemeLength = options.postPhonemeLength;
  if (options.pauseLengthScale !== undefined) query.pauseLengthScale = options.pauseLengthScale;
  if (options.phraseBreathSec && Array.isArray(query.accent_phrases)) {
    addPhraseBreaths(query.accent_phrases as AccentPhrase[], options.phraseBreathSec);
  }

  const wavRes = await request(`/synthesis?${new URLSearchParams({ speaker: String(options.speaker) })}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  });
  return Buffer.from(await wavRes.arrayBuffer());
}
