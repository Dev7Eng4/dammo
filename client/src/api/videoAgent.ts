import type {
  CreateVideoAgentRunPayload,
  VideoAgentConfig,
  VideoAgentRun,
  VideoAgentRunSummary,
  VoicevoxStatus,
} from '../types/videoAgent'
import { API_V1 } from './config'
import { fetchJson, withSignal, type FetchOptions } from './http'

const BASE = `${API_V1}/video-agent`

export const VIDEO_AGENT_STREAM_URL = `${BASE}/stream`

export function videoAgentVideoUrl(runId: string): string {
  return `${BASE}/runs/${runId}/video`
}

/** WAV sample of one VOICEVOX voice; the server falls back to a stock sentence without `text`. */
export function voicevoxPreviewUrl(speaker: number, speed: number, text?: string): string {
  const params = new URLSearchParams({ speaker: String(speaker), speed: String(speed) })
  if (text?.trim()) params.set('text', text.trim().slice(0, 120))
  return `${BASE}/voicevox/preview?${params}`
}

export function fetchVideoAgentConfig(options?: FetchOptions) {
  return fetchJson<VideoAgentConfig>(`${BASE}/config`, withSignal(undefined, options))
}

export function fetchVoicevoxStatus(options?: FetchOptions) {
  return fetchJson<VoicevoxStatus>(`${BASE}/voicevox`, withSignal(undefined, options))
}

export function fetchVideoAgentRuns(options?: FetchOptions) {
  return fetchJson<{ items: VideoAgentRunSummary[] }>(`${BASE}/runs`, withSignal(undefined, options))
}

export function fetchVideoAgentRun(id: string, options?: FetchOptions) {
  return fetchJson<VideoAgentRun>(`${BASE}/runs/${id}`, withSignal(undefined, options))
}

function postJson<T>(url: string, body?: unknown) {
  return fetchJson<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
}

export function createVideoAgentRun(payload: CreateVideoAgentRunPayload) {
  return postJson<VideoAgentRun>(`${BASE}/runs`, payload)
}

export function approveVideoAgentRun(id: string, feedback?: string) {
  return postJson<VideoAgentRun>(`${BASE}/runs/${id}/approve`, { feedback })
}

export function rejectVideoAgentRun(id: string, feedback: string) {
  return postJson<VideoAgentRun>(`${BASE}/runs/${id}/reject`, { feedback })
}

export function cancelVideoAgentRun(id: string) {
  return postJson<VideoAgentRun>(`${BASE}/runs/${id}/cancel`)
}

export function resumeVideoAgentRun(id: string) {
  return postJson<VideoAgentRun>(`${BASE}/runs/${id}/resume`)
}

export function deleteVideoAgentRun(id: string) {
  return fetchJson<{ ok: true }>(`${BASE}/runs/${id}`, { method: 'DELETE' })
}
