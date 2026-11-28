import type { ElevenLabsKeyRecord, VoiceSettingsRecord } from '../../infrastructure/tts/voice-settings.store.js';

export type VoiceProvider = 'voicevox' | 'aivisspeech' | 'elevenlabs';

/** An ElevenLabs key as the API returns it: the secret is masked. */
export type ElevenLabsKeyView = Omit<ElevenLabsKeyRecord, 'apiKey'> & { maskedKey: string };

export interface VoiceSettingsView {
  voicevox: VoiceSettingsRecord['voicevox'] & {
    /** URL actually used (Settings value or VOICEVOX_URL env). */
    effectiveUrl: string;
    effectiveDefaultSpeaker: number;
  };
  aivisspeech: VoiceSettingsRecord['aivisspeech'] & {
    /** URL actually used (Settings value or AIVISSPEECH_URL env). */
    effectiveUrl: string;
    effectiveDefaultSpeaker: number;
  };
  elevenlabs: Omit<VoiceSettingsRecord['elevenlabs'], 'keys'> & { keys: ElevenLabsKeyView[] };
}

export interface SynthesizeSpeechInput {
  provider: VoiceProvider;
  text: string;
  /** VOICEVOX / AivisSpeech style id; defaults to the Settings default speaker. */
  speaker?: number;
  /** Saved voice (preset) of the chosen provider; defaults to that provider's default preset. */
  presetId?: string;
  /** ElevenLabs overrides on top of the preset (e.g. to try a voice before saving it). */
  voiceId?: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  /** Speech speed (VOICEVOX speedScale / ElevenLabs speed). */
  speed?: number;
  /** VOICEVOX overrides on top of the preset. */
  pitchScale?: number;
  intonationScale?: number;
  volumeScale?: number;
  pauseLengthScale?: number;
}

export interface SynthesizedSpeech {
  audio: Buffer;
  contentType: string;
  provider: VoiceProvider;
}
