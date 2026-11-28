import { env } from '../../config/env.js';
import { paths } from '../../config/paths.js';
import { readJson, writeJson } from '../storage/json-store.js';

/** One ElevenLabs API key. The raw key never leaves the server (the API masks it). */
export interface ElevenLabsKeyRecord {
  id: string;
  label: string;
  apiKey: string;
  enabled: boolean;
  createdAt: string;
  /** Last result of a quota check / synthesis with this key. */
  status?: 'ok' | 'invalid' | 'quota_exceeded' | 'error';
  statusMessage?: string;
  lastCheckedAt?: string;
  characterCount?: number;
  characterLimit?: number;
  tier?: string;
}

/** A saved, named ElevenLabs voice with its own settings — pick it by name when generating speech. */
export interface ElevenLabsVoicePreset {
  id: string;
  name: string;
  voiceId: string;
  /** ElevenLabs voice name at the time it was saved (display only). */
  voiceName: string;
  modelId: string;
  stability: number;
  similarityBoost: number;
  style: number;
  speed: number;
  createdAt: string;
  updatedAt: string;
}

/** A saved, named VOICEVOX voice: a speaker style plus its own prosody settings. */
export interface VoicevoxVoicePreset {
  id: string;
  name: string;
  /** VOICEVOX style id (GET /speakers). */
  speaker: number;
  /** "Speaker — Style" at the time it was saved (display only). */
  speakerName: string;
  speedScale: number;
  pitchScale: number;
  intonationScale: number;
  volumeScale: number;
  pauseLengthScale: number;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_VOICEVOX_PRESET_SETTINGS = {
  speedScale: 1,
  pitchScale: 0,
  intonationScale: 1,
  volumeScale: 1,
  pauseLengthScale: 1,
};

/** Local engines that speak the VOICEVOX Engine API. AivisSpeech uses the same preset shape. */
export type VoiceEngine = 'voicevox' | 'aivisspeech';

export interface SpeechEngineSettings {
  /** Engine base URL. Empty → the engine's env URL (VOICEVOX_URL / AIVISSPEECH_URL). */
  url: string;
  /** Default style id; null → the engine's env speaker. Superseded by the default preset. */
  defaultSpeaker: number | null;
  presets: VoicevoxVoicePreset[];
  /** Preset used when a caller names none. */
  defaultPresetId: string | null;
}

export interface VoiceSettingsRecord {
  voicevox: SpeechEngineSettings;
  aivisspeech: SpeechEngineSettings;
  elevenlabs: {
    keys: ElevenLabsKeyRecord[];
    presets: ElevenLabsVoicePreset[];
    /** Preset used when a caller names none. */
    defaultPresetId: string | null;
    outputFormat: string;
  };
}

/** Shape written before presets existed: one flat default voice. */
interface LegacyElevenLabsSettings {
  defaultVoiceId?: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  speed?: number;
}

export const DEFAULT_ELEVENLABS_MODEL = 'eleven_multilingual_v2';
export const DEFAULT_ELEVENLABS_OUTPUT_FORMAT = 'mp3_44100_128';

export const DEFAULT_VOICE_SETTINGS: VoiceSettingsRecord = {
  voicevox: { url: '', defaultSpeaker: null, presets: [], defaultPresetId: null },
  aivisspeech: { url: '', defaultSpeaker: null, presets: [], defaultPresetId: null },
  elevenlabs: {
    keys: [],
    presets: [],
    defaultPresetId: null,
    outputFormat: DEFAULT_ELEVENLABS_OUTPUT_FORMAT,
  },
};

export const DEFAULT_PRESET_VOICE_SETTINGS = { stability: 0.5, similarityBoost: 0.75, style: 0, speed: 1 };

const LEGACY_PRESET_ID = 'legacy-default';

/** Turns the old single default voice into a preset so nothing configured is lost. */
function migrateLegacy(stored: LegacyElevenLabsSettings | undefined): Pick<VoiceSettingsRecord['elevenlabs'], 'presets' | 'defaultPresetId'> {
  if (!stored?.defaultVoiceId) return { presets: [], defaultPresetId: null };
  const now = new Date().toISOString();
  return {
    presets: [
      {
        id: LEGACY_PRESET_ID,
        name: 'Mặc định',
        voiceId: stored.defaultVoiceId,
        voiceName: stored.defaultVoiceId,
        modelId: stored.modelId ?? DEFAULT_ELEVENLABS_MODEL,
        stability: stored.stability ?? DEFAULT_PRESET_VOICE_SETTINGS.stability,
        similarityBoost: stored.similarityBoost ?? DEFAULT_PRESET_VOICE_SETTINGS.similarityBoost,
        style: stored.style ?? DEFAULT_PRESET_VOICE_SETTINGS.style,
        speed: stored.speed ?? DEFAULT_PRESET_VOICE_SETTINGS.speed,
        createdAt: now,
        updatedAt: now,
      },
    ],
    defaultPresetId: LEGACY_PRESET_ID,
  };
}

export function readVoiceSettings(): VoiceSettingsRecord {
  const stored = readJson<{
    voicevox?: Partial<SpeechEngineSettings>;
    aivisspeech?: Partial<SpeechEngineSettings>;
    elevenlabs?: Partial<VoiceSettingsRecord['elevenlabs']> & LegacyElevenLabsSettings;
  }>(paths.voiceSettings);
  const el = stored?.elevenlabs;
  const presetState = Array.isArray(el?.presets)
    ? { presets: el.presets, defaultPresetId: el.defaultPresetId ?? null }
    : migrateLegacy(el);
  const engine = (value: Partial<SpeechEngineSettings> | undefined): SpeechEngineSettings => ({
    url: value?.url ?? '',
    defaultSpeaker: value?.defaultSpeaker ?? null,
    presets: Array.isArray(value?.presets) ? value.presets : [],
    defaultPresetId: value?.defaultPresetId ?? null,
  });
  return {
    voicevox: engine(stored?.voicevox),
    aivisspeech: engine(stored?.aivisspeech),
    elevenlabs: {
      keys: Array.isArray(el?.keys) ? el.keys : [],
      ...presetState,
      outputFormat: el?.outputFormat || DEFAULT_VOICE_SETTINGS.elevenlabs.outputFormat,
    },
  };
}

export function writeVoiceSettings(next: VoiceSettingsRecord): VoiceSettingsRecord {
  writeJson(paths.voiceSettings, next);
  return next;
}

export function updateVoiceSettings(updater: (current: VoiceSettingsRecord) => VoiceSettingsRecord): VoiceSettingsRecord {
  return writeVoiceSettings(updater(readVoiceSettings()));
}

/** Engine URL: the Settings value, else the engine's env URL. */
export function resolveEngineUrl(engine: VoiceEngine = 'voicevox'): string {
  const fallback = engine === 'aivisspeech' ? env.aivisspeechUrl : env.voicevoxUrl;
  const url = readVoiceSettings()[engine].url.trim() || fallback;
  return url.replace(/\/+$/, '');
}

/** The engine's default saved voice, if any. */
export function resolveEngineDefaultPreset(engine: VoiceEngine = 'voicevox'): VoicevoxVoicePreset | undefined {
  const { presets, defaultPresetId } = readVoiceSettings()[engine];
  return presets.find(preset => preset.id === defaultPresetId) ?? presets[0];
}

/** Default style id: the default saved voice, else the Settings value, else the engine's env speaker. */
export function resolveEngineDefaultSpeaker(engine: VoiceEngine = 'voicevox'): number {
  const fallback = engine === 'aivisspeech' ? env.aivisspeechSpeaker : env.voicevoxSpeaker;
  return resolveEngineDefaultPreset(engine)?.speaker ?? readVoiceSettings()[engine].defaultSpeaker ?? fallback;
}

/** VOICEVOX Engine URL: the Settings value, else the VOICEVOX_URL env. */
export function resolveVoicevoxUrl(): string {
  return resolveEngineUrl('voicevox');
}

/** The default saved VOICEVOX voice, if any. */
export function resolveVoicevoxDefaultPreset(): VoicevoxVoicePreset | undefined {
  return resolveEngineDefaultPreset('voicevox');
}

/** Default VOICEVOX style id: the default saved voice, else the Settings value, else VOICEVOX_SPEAKER env. */
export function resolveVoicevoxDefaultSpeaker(): number {
  return resolveEngineDefaultSpeaker('voicevox');
}
