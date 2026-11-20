import crypto from 'node:crypto';
import { AppError } from '../../shared/http/errors.js';
import { synthesizeElevenLabs } from '../../infrastructure/tts/elevenlabs.client.js';
import { synthesizeVoicevox, type VoicevoxSynthOptions } from '../../infrastructure/tts/voicevox.client.js';
import { readVoiceSettings } from '../../infrastructure/tts/voice-settings.store.js';
import { encodeWav, silencePcm } from '../../infrastructure/tts/wav.js';
import { NARRATION_PACING } from '../video-agent/narration.js';
import { voiceService } from './voice.service.js';
import type { VoiceProvider } from './voice.types.js';

/** ElevenLabs returns raw 16-bit mono PCM at this rate; it matches VOICEVOX's default output. */
const ELEVENLABS_PCM_FORMAT = 'pcm_24000';
const ELEVENLABS_PCM = { sampleRate: 24000, channels: 1, bitsPerSample: 16 } as const;
const ELEVENLABS_MIN_SPEED = 0.7;
const ELEVENLABS_MAX_SPEED = 1.2;

/** VOICEVOX voice settings picked for one run only (same fields as a saved VOICEVOX voice). */
export interface VoicevoxCustomVoice {
  speaker: number;
  speakerName?: string;
  speedScale: number;
  pitchScale: number;
  intonationScale: number;
  volumeScale: number;
  pauseLengthScale: number;
}

/** ElevenLabs voice settings picked for one run only (same fields as a saved ElevenLabs voice). */
export interface ElevenLabsCustomVoice {
  voiceId: string;
  voiceName?: string;
  modelId: string;
  stability: number;
  similarityBoost: number;
  style: number;
  speed: number;
}

/** Which voice reads the narration, as stored on a run. */
export interface NarrationVoiceRef {
  provider?: VoiceProvider;
  /** A saved voice from Settings → Giọng đọc. */
  presetId?: string;
  /** Settings chosen for this run only; wins over `presetId`. Must match `provider`. */
  custom?: VoicevoxCustomVoice | ElevenLabsCustomVoice;
  /** Legacy runs: a bare VOICEVOX style id, used when neither a preset nor custom settings are set. */
  voicevoxSpeaker: number;
}

function isElevenLabsCustom(value: NarrationVoiceRef['custom']): value is ElevenLabsCustomVoice {
  return !!value && 'voiceId' in value;
}

function isVoicevoxCustom(value: NarrationVoiceRef['custom']): value is VoicevoxCustomVoice {
  return !!value && 'speaker' in value;
}

export interface NarrationVoice {
  provider: VoiceProvider;
  /** Human-readable name for logs / UI. */
  label: string;
  /** Changes whenever anything that affects the sound changes, so cached sentence audio is redone. */
  cacheKey: string;
  /** One sentence → WAV bytes, with `pauseSec` of silence at the end. */
  synthesize(sentence: string, pauseSec: number): Promise<Buffer>;
}

function hash(value: unknown): string {
  return crypto.createHash('sha1').update(JSON.stringify(value)).digest('hex').slice(0, 12);
}

function voicevoxNarrationOptions(
  speaker: number,
  speedScale: number,
  pauseSec: number | undefined,
  preset?: { speedScale: number; pitchScale: number; intonationScale: number; volumeScale: number; pauseLengthScale: number },
): VoicevoxSynthOptions {
  return {
    speaker,
    speedScale: speedScale * NARRATION_PACING.baseSpeed * (preset?.speedScale ?? 1),
    pauseLengthScale: NARRATION_PACING.commaPauseScale * (preset?.pauseLengthScale ?? 1),
    phraseBreathSec: NARRATION_PACING.phraseBreathSec,
    ...(preset ? { pitchScale: preset.pitchScale, intonationScale: preset.intonationScale, volumeScale: preset.volumeScale } : {}),
    ...(pauseSec !== undefined ? { postPhonemeLength: pauseSec } : {}),
  };
}

/**
 * Resolves the voice a run should be read with: settings chosen for this run, a saved VOICEVOX /
 * ElevenLabs voice, or — for runs made before saved voices existed — the bare VOICEVOX speaker.
 * `speedScale` is the producer's ×speed.
 */
export function resolveNarrationVoice(ref: NarrationVoiceRef, speedScale: number): NarrationVoice {
  const settings = readVoiceSettings();
  const provider = ref.provider ?? 'voicevox';

  if (provider === 'elevenlabs') {
    const saved = ref.custom ? undefined : settings.elevenlabs.presets.find(item => item.id === ref.presetId);
    const voice: ElevenLabsCustomVoice | undefined = isElevenLabsCustom(ref.custom) ? ref.custom : saved;
    if (!voice) {
      throw new AppError('Voice ElevenLabs đã chọn không còn — chọn lại voice ở bước Giọng đọc', 400, 'VOICE_PRESET_NOT_FOUND');
    }
    const speed = Math.min(ELEVENLABS_MAX_SPEED, Math.max(ELEVENLABS_MIN_SPEED, voice.speed * speedScale));
    const sound = {
      voiceId: voice.voiceId,
      modelId: voice.modelId,
      stability: voice.stability,
      similarityBoost: voice.similarityBoost,
      style: voice.style,
      speed,
    };
    return {
      provider,
      label: saved ? `ElevenLabs · ${saved.name}` : `ElevenLabs · ${voice.voiceName ?? voice.voiceId} (tùy chỉnh)`,
      cacheKey: `el-${hash(sound)}`,
      async synthesize(sentence, pauseSec) {
        const pcm = await voiceService.withElevenLabsKey(apiKey =>
          synthesizeElevenLabs(apiKey, sentence, { ...sound, outputFormat: ELEVENLABS_PCM_FORMAT }),
        );
        return encodeWav(ELEVENLABS_PCM, [pcm, silencePcm({ ...ELEVENLABS_PCM, data: Buffer.alloc(0) }, pauseSec)]);
      },
    };
  }

  const saved = ref.custom || !ref.presetId ? undefined : settings.voicevox.presets.find(item => item.id === ref.presetId);
  if (!ref.custom && ref.presetId && !saved) {
    throw new AppError('Voice VOICEVOX đã chọn không còn — chọn lại voice ở bước Giọng đọc', 400, 'VOICE_PRESET_NOT_FOUND');
  }
  const voice: VoicevoxCustomVoice | undefined = isVoicevoxCustom(ref.custom) ? ref.custom : saved;
  const speaker = voice?.speaker ?? ref.voicevoxSpeaker;
  const prosody = voice && {
    speedScale: voice.speedScale,
    pitchScale: voice.pitchScale,
    intonationScale: voice.intonationScale,
    volumeScale: voice.volumeScale,
    pauseLengthScale: voice.pauseLengthScale,
  };
  return {
    provider: 'voicevox',
    label: saved
      ? `VOICEVOX · ${saved.name}`
      : voice
        ? `VOICEVOX · ${voice.speakerName ?? `#${speaker}`} (tùy chỉnh)`
        : `VOICEVOX #${speaker}`,
    // Bare-speaker runs keep their old key shape so their cached sentences stay valid.
    cacheKey: prosody ? `vv-${hash({ speaker, producerSpeed: speedScale, ...prosody })}` : `${speaker}|${speedScale}`,
    synthesize(sentence, pauseSec) {
      return synthesizeVoicevox(sentence, voicevoxNarrationOptions(speaker, speedScale, pauseSec, prosody));
    },
  };
}
