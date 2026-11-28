import { API_V1 } from './config'
import { fetchJson, withSignal, type FetchOptions } from './http'
import type {
  ElevenLabsKey,
  ElevenLabsModel,
  ElevenLabsVoicePreset,
  VoicePresetPayload,
  VoiceEngine,
  VoiceProvider,
  VoicevoxPresetPayload,
  VoicevoxVoicePreset,
  ElevenLabsVoice,
  SynthesizeSpeechPayload,
  UpdateVoiceSettingsPayload,
  VoicevoxEngineStatus,
  VoiceSettings,
} from '../types/voice'
import i18n from '../i18n'

const BASE = `${API_V1}/voice`
const JSON_HEADERS = { 'Content-Type': 'application/json' }

export function fetchVoiceSettings(options?: FetchOptions) {
  return fetchJson<{ item: VoiceSettings }>(`${BASE}/settings`, withSignal(undefined, options))
}

export function updateVoiceSettings(payload: UpdateVoiceSettingsPayload) {
  return fetchJson<{ item: VoiceSettings }>(`${BASE}/settings`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  })
}

export function fetchVoicevoxEngineStatus(options?: FetchOptions, engine: VoiceEngine = 'voicevox') {
  return fetchJson<VoicevoxEngineStatus>(`${BASE}/${engine}/status`, withSignal(undefined, options))
}

export function addElevenLabsKey(payload: { label?: string; apiKey: string }) {
  return fetchJson<{ item: ElevenLabsKey }>(`${BASE}/elevenlabs/keys`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  })
}

export function updateElevenLabsKey(id: string, payload: { label?: string; enabled?: boolean }) {
  return fetchJson<{ item: ElevenLabsKey }>(`${BASE}/elevenlabs/keys/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  })
}

export function deleteElevenLabsKey(id: string) {
  return fetchJson<{ ok: true }>(`${BASE}/elevenlabs/keys/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function checkElevenLabsKey(id: string) {
  return fetchJson<{ item: ElevenLabsKey }>(`${BASE}/elevenlabs/keys/${encodeURIComponent(id)}/check`, {
    method: 'POST',
  })
}

export function checkAllElevenLabsKeys() {
  return fetchJson<{ items: ElevenLabsKey[] }>(`${BASE}/elevenlabs/keys/check`, { method: 'POST' })
}

export function fetchElevenLabsVoices(options?: FetchOptions) {
  return fetchJson<{ items: ElevenLabsVoice[] }>(`${BASE}/elevenlabs/voices`, withSignal(undefined, options))
}

export function fetchElevenLabsModels(options?: FetchOptions) {
  return fetchJson<{ items: ElevenLabsModel[] }>(`${BASE}/elevenlabs/models`, withSignal(undefined, options))
}

export function createVoicePreset(payload: VoicePresetPayload) {
  return fetchJson<{ item: ElevenLabsVoicePreset }>(`${BASE}/elevenlabs/presets`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  })
}

export function updateVoicePreset(id: string, payload: Partial<VoicePresetPayload>) {
  return fetchJson<{ item: ElevenLabsVoicePreset }>(`${BASE}/elevenlabs/presets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  })
}

export function deleteVoicePreset(id: string) {
  return fetchJson<{ ok: true }>(`${BASE}/elevenlabs/presets/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function setDefaultVoicePreset(id: string) {
  return fetchJson<{ item: VoiceSettings }>(`${BASE}/elevenlabs/presets/${encodeURIComponent(id)}/default`, {
    method: 'POST',
  })
}

export function createVoicevoxPreset(payload: VoicevoxPresetPayload, engine: VoiceEngine = 'voicevox') {
  return fetchJson<{ item: VoicevoxVoicePreset }>(`${BASE}/${engine}/presets`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  })
}

export function updateVoicevoxPreset(id: string, payload: Partial<VoicevoxPresetPayload>, engine: VoiceEngine = 'voicevox') {
  return fetchJson<{ item: VoicevoxVoicePreset }>(`${BASE}/${engine}/presets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  })
}

export function deleteVoicevoxPreset(id: string, engine: VoiceEngine = 'voicevox') {
  return fetchJson<{ ok: true }>(`${BASE}/${engine}/presets/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function setDefaultVoicevoxPreset(id: string, engine: VoiceEngine = 'voicevox') {
  return fetchJson<{ item: VoiceSettings }>(`${BASE}/${engine}/presets/${encodeURIComponent(id)}/default`, {
    method: 'POST',
  })
}

/** A sample read exactly as the narration step will read it (same saved voice, pacing and speed). */
export async function previewNarrationVoice(payload: {
  provider: VoiceProvider
  presetId?: string
  /** Settings for this video only (same fields as a saved voice, without its name). */
  custom?: Record<string, unknown>
  voicevoxSpeaker?: number
  speed?: number
  text: string
}): Promise<Blob> {
  const res = await fetch(`${BASE}/narration-preview`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(payload) })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error || i18n.t('common:errors.requestFailed', { status: res.status }))
  }
  return res.blob()
}

/** Text → audio Blob (WAV for VOICEVOX, MP3 for ElevenLabs). */
export async function synthesizeSpeech(payload: SynthesizeSpeechPayload): Promise<Blob> {
  const res = await fetch(`${BASE}/tts`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(payload) })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error || i18n.t('common:errors.requestFailed', { status: res.status }))
  }
  return res.blob()
}

/** Reading dictionary: words the narration voice reads as the given katakana (script and subtitles unchanged). */
export interface NarrationReading {
  surface: string
  reading: string
  note?: string
  addedAt: string
}

export function fetchNarrationReadings(options?: FetchOptions) {
  return fetchJson<{ items: NarrationReading[] }>(`${BASE}/readings`, withSignal(undefined, options))
}

export function saveNarrationReading(payload: { surface: string; reading: string; note?: string }) {
  return fetchJson<{ items: NarrationReading[] }>(`${BASE}/readings`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  })
}

export function deleteNarrationReading(surface: string) {
  return fetchJson<{ items: NarrationReading[] }>(`${BASE}/readings/${encodeURIComponent(surface)}`, { method: 'DELETE' })
}
