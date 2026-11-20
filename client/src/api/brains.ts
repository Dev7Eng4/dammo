import type { Brain, BrainsSnapshot, PipelineStatus } from '../types/brains'
import { API_V1 } from './config'
import { fetchJson, withSignal, type FetchOptions } from './http'

const BASE = `${API_V1}/brains`

export const BRAINS_STREAM_URL = `${BASE}/stream`

export function fetchBrains(options?: FetchOptions) {
  return fetchJson<BrainsSnapshot>(BASE, withSignal(undefined, options))
}

function send<T>(url: string, method: string, body?: unknown) {
  return fetchJson<T>(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
}

export function runBrain(id: string, notes?: string) {
  return send<Brain>(`${BASE}/${id}/run`, 'POST', { notes })
}

export function cancelBrain(id: string) {
  return send<Brain>(`${BASE}/${id}/cancel`, 'POST')
}

export function forgetBrain(id: string) {
  return send<Brain>(`${BASE}/${id}/forget`, 'POST')
}

export function setBrainAutoInterval(id: string, autoIntervalHours: number) {
  return send<Brain>(`${BASE}/${id}`, 'PATCH', { autoIntervalHours })
}

export function runPipeline(notes?: string) {
  return send<PipelineStatus>(`${BASE}/pipeline/run`, 'POST', { notes })
}

export function cancelPipeline() {
  return send<PipelineStatus>(`${BASE}/pipeline/cancel`, 'POST')
}
