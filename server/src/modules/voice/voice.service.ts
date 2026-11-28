import { generateId } from '../../shared/id.js';
import { AppError } from '../../shared/http/errors.js';
import {
  ElevenLabsApiError,
  elevenLabsContentType,
  getElevenLabsSubscription,
  listElevenLabsModels,
  listElevenLabsVoices,
  synthesizeElevenLabs,
  type ElevenLabsModel,
  type ElevenLabsVoice,
} from '../../infrastructure/tts/elevenlabs.client.js';
import {
  getVoicevoxVersion,
  listVoicevoxSpeakers,
  synthesizeVoicevox,
} from '../../infrastructure/tts/voicevox.client.js';
import {
  DEFAULT_ELEVENLABS_MODEL,
  DEFAULT_PRESET_VOICE_SETTINGS,
  DEFAULT_VOICEVOX_PRESET_SETTINGS,
  readVoiceSettings,
  resolveEngineDefaultSpeaker,
  resolveEngineUrl,
  updateVoiceSettings,
  type ElevenLabsKeyRecord,
  type ElevenLabsVoicePreset,
  type SpeechEngineSettings,
  type VoiceEngine,
  type VoicevoxVoicePreset,
  type VoiceSettingsRecord,
} from '../../infrastructure/tts/voice-settings.store.js';
import type {
  ElevenLabsKeyView,
  SynthesizeSpeechInput,
  SynthesizedSpeech,
  VoiceSettingsView,
} from './voice.types.js';

export type VoicePresetInput = Omit<ElevenLabsVoicePreset, 'id' | 'createdAt' | 'updatedAt' | 'voiceName'> & {
  voiceName?: string;
};

export type VoicevoxPresetInput = Omit<VoicevoxVoicePreset, 'id' | 'createdAt' | 'updatedAt' | 'speakerName'> & {
  speakerName?: string;
};

/** Applies `change` to one engine's settings, leaving everything else as it is. */
function withEngine(
  current: VoiceSettingsRecord,
  engine: VoiceEngine,
  change: (settings: SpeechEngineSettings) => SpeechEngineSettings,
): VoiceSettingsRecord {
  return engine === 'aivisspeech'
    ? { ...current, aivisspeech: change(current.aivisspeech) }
    : { ...current, voicevox: change(current.voicevox) };
}

const ENGINE_LABEL: Record<VoiceEngine, string> = { voicevox: 'VOICEVOX', aivisspeech: 'AivisSpeech' };

function presetNotFound(): AppError {
  return new AppError('Không tìm thấy voice đã lưu', 404, 'VOICE_PRESET_NOT_FOUND');
}

type KeyPatch = Partial<Omit<ElevenLabsKeyRecord, 'id' | 'apiKey' | 'createdAt'>>;

const NO_QUOTA_PERMISSION =
  'Key bị giới hạn quyền (thiếu user_read) nên không đọc được quota — vẫn dùng được để tạo giọng nếu có quyền Text to Speech.';

/** Quota of a key, or null when it is a restricted key without the user_read scope. */
async function readSubscription(apiKey: string) {
  try {
    return await getElevenLabsSubscription(apiKey);
  } catch (err) {
    if (err instanceof ElevenLabsApiError && err.kind === 'missing_permission') return null;
    throw err;
  }
}

function quotaPatch(sub: Awaited<ReturnType<typeof readSubscription>>): KeyPatch {
  if (!sub) {
    return { status: 'ok', statusMessage: NO_QUOTA_PERMISSION, characterCount: undefined, characterLimit: undefined, tier: undefined };
  }
  return {
    status: sub.characterCount >= sub.characterLimit ? 'quota_exceeded' : 'ok',
    statusMessage: undefined,
    characterCount: sub.characterCount,
    characterLimit: sub.characterLimit,
    tier: sub.tier,
  };
}

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) return '••••';
  return `${apiKey.slice(0, 4)}••••${apiKey.slice(-4)}`;
}

function toKeyView({ apiKey, ...rest }: ElevenLabsKeyRecord): ElevenLabsKeyView {
  return { ...rest, maskedKey: maskApiKey(apiKey) };
}

function patchKey(id: string, patch: KeyPatch): ElevenLabsKeyRecord {
  let updated: ElevenLabsKeyRecord | undefined;
  updateVoiceSettings(current => ({
    ...current,
    elevenlabs: {
      ...current.elevenlabs,
      keys: current.elevenlabs.keys.map(key => {
        if (key.id !== id) return key;
        updated = { ...key, ...patch };
        return updated;
      }),
    },
  }));
  if (!updated) throw new AppError('Không tìm thấy ElevenLabs key', 404, 'ELEVENLABS_KEY_NOT_FOUND');
  return updated;
}

function remaining(key: ElevenLabsKeyRecord): number {
  if (key.characterLimit === undefined || key.characterCount === undefined) return Number.MAX_SAFE_INTEGER;
  return key.characterLimit - key.characterCount;
}

/** Enabled keys, healthiest and with the most quota left first. */
function usableKeys(settings: VoiceSettingsRecord): ElevenLabsKeyRecord[] {
  return settings.elevenlabs.keys
    .filter(key => key.enabled && key.status !== 'invalid')
    .sort((a, b) => {
      const aBad = a.status === 'quota_exceeded' ? 1 : 0;
      const bBad = b.status === 'quota_exceeded' ? 1 : 0;
      return aBad - bBad || remaining(b) - remaining(a);
    });
}

export const voiceService = {
  getSettings(): VoiceSettingsView {
    const settings = readVoiceSettings();
    return {
      voicevox: {
        ...settings.voicevox,
        effectiveUrl: resolveEngineUrl('voicevox'),
        effectiveDefaultSpeaker: resolveEngineDefaultSpeaker('voicevox'),
      },
      aivisspeech: {
        ...settings.aivisspeech,
        effectiveUrl: resolveEngineUrl('aivisspeech'),
        effectiveDefaultSpeaker: resolveEngineDefaultSpeaker('aivisspeech'),
      },
      elevenlabs: { ...settings.elevenlabs, keys: settings.elevenlabs.keys.map(toKeyView) },
    };
  },

  updateSettings(input: {
    voicevox?: Partial<VoiceSettingsRecord['voicevox']>;
    aivisspeech?: Partial<VoiceSettingsRecord['aivisspeech']>;
    elevenlabs?: Partial<Omit<VoiceSettingsRecord['elevenlabs'], 'keys'>>;
  }): VoiceSettingsView {
    updateVoiceSettings(current => ({
      voicevox: { ...current.voicevox, ...input.voicevox },
      aivisspeech: { ...current.aivisspeech, ...input.aivisspeech },
      elevenlabs: { ...current.elevenlabs, ...input.elevenlabs, keys: current.elevenlabs.keys },
    }));
    return this.getSettings();
  },

  listPresets(): ElevenLabsVoicePreset[] {
    return readVoiceSettings().elevenlabs.presets;
  },

  /** Saves a named voice. The first one saved becomes the default. */
  createPreset(input: VoicePresetInput): ElevenLabsVoicePreset {
    const now = new Date().toISOString();
    const preset: ElevenLabsVoicePreset = {
      ...input,
      voiceName: input.voiceName?.trim() || input.voiceId,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    };
    updateVoiceSettings(current => ({
      ...current,
      elevenlabs: {
        ...current.elevenlabs,
        presets: [...current.elevenlabs.presets, preset],
        defaultPresetId: current.elevenlabs.defaultPresetId ?? preset.id,
      },
    }));
    return preset;
  },

  updatePreset(id: string, patch: Partial<VoicePresetInput>): ElevenLabsVoicePreset {
    let updated: ElevenLabsVoicePreset | undefined;
    updateVoiceSettings(current => ({
      ...current,
      elevenlabs: {
        ...current.elevenlabs,
        presets: current.elevenlabs.presets.map(preset => {
          if (preset.id !== id) return preset;
          updated = { ...preset, ...patch, updatedAt: new Date().toISOString() };
          return updated;
        }),
      },
    }));
    if (!updated) throw presetNotFound();
    return updated;
  },

  /** Removing the default hands the default to the next saved voice. */
  deletePreset(id: string): void {
    const current = readVoiceSettings();
    if (!current.elevenlabs.presets.some(preset => preset.id === id)) throw presetNotFound();
    updateVoiceSettings(settings => {
      const presets = settings.elevenlabs.presets.filter(preset => preset.id !== id);
      const defaultPresetId =
        settings.elevenlabs.defaultPresetId === id ? (presets[0]?.id ?? null) : settings.elevenlabs.defaultPresetId;
      return { ...settings, elevenlabs: { ...settings.elevenlabs, presets, defaultPresetId } };
    });
  },

  setDefaultPreset(id: string): VoiceSettingsView {
    if (!readVoiceSettings().elevenlabs.presets.some(preset => preset.id === id)) throw presetNotFound();
    return this.updateSettings({ elevenlabs: { defaultPresetId: id } });
  },

  listVoicevoxPresets(engine: VoiceEngine = 'voicevox'): VoicevoxVoicePreset[] {
    return readVoiceSettings()[engine].presets;
  },

  /** Saves a named VOICEVOX / AivisSpeech voice. The first one saved becomes the default. */
  createVoicevoxPreset(input: VoicevoxPresetInput, engine: VoiceEngine = 'voicevox'): VoicevoxVoicePreset {
    const now = new Date().toISOString();
    const preset: VoicevoxVoicePreset = {
      ...input,
      speakerName: input.speakerName?.trim() || `#${input.speaker}`,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    };
    updateVoiceSettings(current =>
      withEngine(current, engine, settings => ({
        ...settings,
        presets: [...settings.presets, preset],
        defaultPresetId: settings.defaultPresetId ?? preset.id,
      })),
    );
    return preset;
  },

  updateVoicevoxPreset(id: string, patch: Partial<VoicevoxPresetInput>, engine: VoiceEngine = 'voicevox'): VoicevoxVoicePreset {
    let updated: VoicevoxVoicePreset | undefined;
    updateVoiceSettings(current =>
      withEngine(current, engine, settings => ({
        ...settings,
        presets: settings.presets.map(preset => {
          if (preset.id !== id) return preset;
          updated = { ...preset, ...patch, updatedAt: new Date().toISOString() };
          return updated;
        }),
      })),
    );
    if (!updated) throw presetNotFound();
    return updated;
  },

  /** Removing the default hands the default to the next saved voice. */
  deleteVoicevoxPreset(id: string, engine: VoiceEngine = 'voicevox'): void {
    if (!readVoiceSettings()[engine].presets.some(preset => preset.id === id)) throw presetNotFound();
    updateVoiceSettings(current =>
      withEngine(current, engine, settings => {
        const presets = settings.presets.filter(preset => preset.id !== id);
        const defaultPresetId = settings.defaultPresetId === id ? (presets[0]?.id ?? null) : settings.defaultPresetId;
        return { ...settings, presets, defaultPresetId };
      }),
    );
  },

  setDefaultVoicevoxPreset(id: string, engine: VoiceEngine = 'voicevox'): VoiceSettingsView {
    if (!readVoiceSettings()[engine].presets.some(preset => preset.id === id)) throw presetNotFound();
    return this.updateSettings({ [engine]: { defaultPresetId: id } });
  },

  /** Verifies the key against ElevenLabs before saving it. */
  async addElevenLabsKey(input: { label?: string; apiKey: string }): Promise<ElevenLabsKeyView> {
    const settings = readVoiceSettings();
    if (settings.elevenlabs.keys.some(key => key.apiKey === input.apiKey)) {
      throw new AppError('Key này đã có trong danh sách', 409, 'ELEVENLABS_KEY_DUPLICATE');
    }
    const subscription = await readSubscription(input.apiKey);
    const now = new Date().toISOString();
    const record: ElevenLabsKeyRecord = {
      id: generateId(),
      label: input.label?.trim() || `Key ${settings.elevenlabs.keys.length + 1}`,
      apiKey: input.apiKey,
      enabled: true,
      createdAt: now,
      lastCheckedAt: now,
      ...quotaPatch(subscription),
    };
    updateVoiceSettings(current => ({
      ...current,
      elevenlabs: { ...current.elevenlabs, keys: [...current.elevenlabs.keys, record] },
    }));
    return toKeyView(record);
  },

  updateElevenLabsKey(id: string, patch: { label?: string; enabled?: boolean }): ElevenLabsKeyView {
    return toKeyView(patchKey(id, patch));
  },

  removeElevenLabsKey(id: string): void {
    const before = readVoiceSettings().elevenlabs.keys.length;
    const next = updateVoiceSettings(current => ({
      ...current,
      elevenlabs: { ...current.elevenlabs, keys: current.elevenlabs.keys.filter(key => key.id !== id) },
    }));
    if (next.elevenlabs.keys.length === before) {
      throw new AppError('Không tìm thấy ElevenLabs key', 404, 'ELEVENLABS_KEY_NOT_FOUND');
    }
  },

  /** Refreshes quota / validity of one key. */
  async checkElevenLabsKey(id: string): Promise<ElevenLabsKeyView> {
    const key = readVoiceSettings().elevenlabs.keys.find(item => item.id === id);
    if (!key) throw new AppError('Không tìm thấy ElevenLabs key', 404, 'ELEVENLABS_KEY_NOT_FOUND');
    const lastCheckedAt = new Date().toISOString();
    try {
      const sub = await readSubscription(key.apiKey);
      return toKeyView(patchKey(id, { ...quotaPatch(sub), lastCheckedAt }));
    } catch (err) {
      const kind = err instanceof ElevenLabsApiError && err.kind !== 'missing_permission' ? err.kind : 'error';
      return toKeyView(
        patchKey(id, { status: kind, statusMessage: err instanceof Error ? err.message : String(err), lastCheckedAt }),
      );
    }
  },

  async checkAllElevenLabsKeys(): Promise<ElevenLabsKeyView[]> {
    const keys = readVoiceSettings().elevenlabs.keys;
    const results: ElevenLabsKeyView[] = [];
    for (const key of keys) results.push(await this.checkElevenLabsKey(key.id));
    return results;
  },

  /**
   * Runs `fn` with the best enabled key; on an invalid / out-of-quota key it marks that key and
   * moves on to the next one.
   */
  async withElevenLabsKey<T>(fn: (apiKey: string) => Promise<T>): Promise<T> {
    const keys = usableKeys(readVoiceSettings());
    if (!keys.length) {
      throw new AppError('Chưa có ElevenLabs API key nào đang bật — thêm key ở Settings → Voice', 400, 'ELEVENLABS_NO_KEY');
    }
    let lastError: unknown;
    for (const key of keys) {
      try {
        return await fn(key.apiKey);
      } catch (err) {
        // Restricted key without this endpoint's scope: try the next key, but keep this one usable.
        if (err instanceof ElevenLabsApiError && err.kind === 'missing_permission') {
          lastError = err;
          continue;
        }
        if (err instanceof ElevenLabsApiError && (err.kind === 'invalid' || err.kind === 'quota_exceeded')) {
          patchKey(key.id, { status: err.kind, statusMessage: err.message, lastCheckedAt: new Date().toISOString() });
          lastError = err;
          continue;
        }
        throw err;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new AppError('Tất cả ElevenLabs key đều lỗi hoặc hết quota', 400, 'ELEVENLABS_ALL_KEYS_FAILED');
  },

  listElevenLabsVoices(): Promise<ElevenLabsVoice[]> {
    return this.withElevenLabsKey(listElevenLabsVoices);
  },

  listElevenLabsModels(): Promise<ElevenLabsModel[]> {
    return this.withElevenLabsKey(listElevenLabsModels);
  },

  async voicevoxStatus(engine: VoiceEngine = 'voicevox') {
    const url = resolveEngineUrl(engine);
    const defaultSpeaker = resolveEngineDefaultSpeaker(engine);
    try {
      const [version, speakers] = await Promise.all([getVoicevoxVersion(engine), listVoicevoxSpeakers(engine)]);
      return { available: true, url, version, defaultSpeaker, speakers };
    } catch (err) {
      return {
        available: false,
        url,
        defaultSpeaker,
        speakers: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },

  /** Single entry point for text-to-speech, whichever provider. */
  async synthesize(input: SynthesizeSpeechInput): Promise<SynthesizedSpeech> {
    if (input.provider === 'voicevox' || input.provider === 'aivisspeech') {
      const engine: VoiceEngine = input.provider;
      const settings = readVoiceSettings()[engine];
      const presetId = input.presetId?.trim() || settings.defaultPresetId;
      const preset = presetId ? settings.presets.find(item => item.id === presetId) : undefined;
      if (input.presetId && !preset) throw presetNotFound();
      const base = preset ?? DEFAULT_VOICEVOX_PRESET_SETTINGS;
      const audio = await synthesizeVoicevox(input.text, {
        engine,
        speaker: input.speaker ?? preset?.speaker ?? resolveEngineDefaultSpeaker(engine),
        speedScale: input.speed ?? base.speedScale,
        pitchScale: input.pitchScale ?? base.pitchScale,
        intonationScale: input.intonationScale ?? base.intonationScale,
        volumeScale: input.volumeScale ?? base.volumeScale,
        pauseLengthScale: input.pauseLengthScale ?? base.pauseLengthScale,
      });
      return { audio, contentType: 'audio/wav', provider: input.provider };
    }

    const { elevenlabs } = readVoiceSettings();
    const presetId = input.presetId?.trim() || elevenlabs.defaultPresetId;
    const preset = presetId ? elevenlabs.presets.find(item => item.id === presetId) : undefined;
    if (input.presetId && !preset) throw presetNotFound();
    const voiceId = input.voiceId?.trim() || preset?.voiceId;
    if (!voiceId) {
      throw new AppError('Chưa có voice ElevenLabs — thêm voice ở Settings → Giọng đọc', 400, 'ELEVENLABS_NO_VOICE');
    }
    const base = preset ?? DEFAULT_PRESET_VOICE_SETTINGS;
    const audio = await this.withElevenLabsKey(apiKey =>
      synthesizeElevenLabs(apiKey, input.text, {
        voiceId,
        modelId: input.modelId?.trim() || preset?.modelId || DEFAULT_ELEVENLABS_MODEL,
        outputFormat: elevenlabs.outputFormat,
        stability: input.stability ?? base.stability,
        similarityBoost: input.similarityBoost ?? base.similarityBoost,
        style: input.style ?? base.style,
        speed: input.speed !== undefined ? Math.min(1.2, Math.max(0.7, input.speed)) : base.speed,
      }),
    );
    return { audio, contentType: elevenLabsContentType(elevenlabs.outputFormat), provider: 'elevenlabs' };
  },
};
