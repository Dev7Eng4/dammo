export type VoiceProvider = 'voicevox' | 'elevenlabs'

export type ElevenLabsKeyStatus = 'ok' | 'invalid' | 'quota_exceeded' | 'error'

export interface ElevenLabsKey {
  id: string
  label: string
  maskedKey: string
  enabled: boolean
  createdAt: string
  status?: ElevenLabsKeyStatus
  statusMessage?: string
  lastCheckedAt?: string
  characterCount?: number
  characterLimit?: number
  tier?: string
}

export interface VoicePresetSettings {
  stability: number
  similarityBoost: number
  style: number
  speed: number
}

/** A saved, named ElevenLabs voice with its own settings. */
export interface ElevenLabsVoicePreset extends VoicePresetSettings {
  id: string
  name: string
  voiceId: string
  voiceName: string
  modelId: string
  createdAt: string
  updatedAt: string
}

export type VoicePresetPayload = Omit<ElevenLabsVoicePreset, 'id' | 'createdAt' | 'updatedAt'>

/** A saved, named VOICEVOX voice: a speaker style plus its own prosody settings. */
export interface VoicevoxVoicePreset {
  id: string
  name: string
  speaker: number
  speakerName: string
  speedScale: number
  pitchScale: number
  intonationScale: number
  volumeScale: number
  pauseLengthScale: number
  createdAt: string
  updatedAt: string
}

export type VoicevoxPresetPayload = Omit<VoicevoxVoicePreset, 'id' | 'createdAt' | 'updatedAt'>

export interface VoiceSettings {
  voicevox: {
    url: string
    defaultSpeaker: number | null
    presets: VoicevoxVoicePreset[]
    defaultPresetId: string | null
    effectiveUrl: string
    effectiveDefaultSpeaker: number
  }
  elevenlabs: {
    keys: ElevenLabsKey[]
    presets: ElevenLabsVoicePreset[]
    defaultPresetId: string | null
    outputFormat: string
  }
}

export interface UpdateVoiceSettingsPayload {
  voicevox?: { url?: string; defaultSpeaker?: number | null; defaultPresetId?: string | null }
  elevenlabs?: { defaultPresetId?: string | null; outputFormat?: string }
}

export interface VoicevoxSpeakerInfo {
  name: string
  styles: { id: number; name: string }[]
}

export interface VoicevoxEngineStatus {
  available: boolean
  url: string
  version?: string
  defaultSpeaker: number
  speakers: VoicevoxSpeakerInfo[]
  error?: string
}

export interface ElevenLabsVoice {
  voiceId: string
  name: string
  category?: string
  previewUrl?: string
  labels?: Record<string, string>
}

export interface ElevenLabsModel {
  modelId: string
  name: string
  languages: string[]
}

export interface SynthesizeSpeechPayload {
  provider: VoiceProvider
  text: string
  speaker?: number
  presetId?: string
  voiceId?: string
  modelId?: string
  stability?: number
  similarityBoost?: number
  style?: number
  speed?: number
  pitchScale?: number
  intonationScale?: number
  volumeScale?: number
  pauseLengthScale?: number
}
