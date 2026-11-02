import type { VideoAgentRun, VideoAgentRunSummary } from '../types/videoAgent'
import type { RemakeJob, RemakeProvider } from './scriptRemake'
import { API_V1 } from './config'
import { fetchJson, withSignal, type FetchOptions } from './http'

const BASE = `${API_V1}/manual-video`

export type ManualStep = 'sources' | 'voice' | 'scenes' | 'video'
export type ManualMotionMode = 'intro' | 'full' | 'scenes'

export interface ManualProjectDetail {
  run: VideoAgentRun
  /** The script in the editable text format (`# title`, `## 1. heading`, one sentence per line). */
  scriptText: string
  /** Image → video default from the channel's video type. */
  motionDefault: ManualMotionMode | 'none'
}

/** `download`: a transcript fetched on its own, not part of any project. */
export type LibraryKind = 'agent' | 'manual' | 'download'
export type LibraryPhase = 'finished' | 'in_progress' | 'download'
export type LibraryFileKind = 'transcript' | 'script' | 'remake' | 'audio' | 'subtitle' | 'video'

export interface LibraryFile {
  kind: LibraryFileKind
  path: string
  sizeBytes: number
}

export interface ManualLibraryItem {
  key: string
  kind: LibraryKind
  phase: LibraryPhase
  runId?: string
  videoId?: string
  title: string
  channelName?: string
  createdAt: string
  updatedAt: string
  /** Pipeline stages reached: source, script, approval, voice, scenes, video. */
  stagesDone: string[]
  chars?: number
  minutes?: number
  durationSec?: number | null
  folder: string
  videoPath?: string
  sizeBytes?: number
  files: LibraryFile[]
}

export interface CreateManualProjectPayload {
  channelId: string
  sourceUrls: string[]
  notes?: string
  voicevoxSpeaker?: number
  speedScale?: number
}

function send<T>(url: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown) {
  return fetchJson<T>(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function fetchManualProjects(options?: FetchOptions) {
  return fetchJson<{ items: VideoAgentRunSummary[] }>(`${BASE}/projects`, withSignal(undefined, options))
}

export function fetchManualProject(id: string, options?: FetchOptions) {
  return fetchJson<ManualProjectDetail>(`${BASE}/projects/${id}`, withSignal(undefined, options))
}

export function fetchManualLibrary(options?: FetchOptions) {
  return fetchJson<{ root: string; downloadsRoot: string; items: ManualLibraryItem[] }>(`${BASE}/library`, withSignal(undefined, options))
}

export function createManualProject(payload: CreateManualProjectPayload) {
  return send<VideoAgentRun>(`${BASE}/projects`, 'POST', payload)
}

export function deleteManualProject(id: string) {
  return send<{ ok: true }>(`${BASE}/projects/${id}`, 'DELETE')
}

export function runManualStep(
  id: string,
  step: ManualStep,
  body: { urls?: string[]; voicevoxSpeaker?: number; speedScale?: number } = {},
) {
  return send<VideoAgentRun>(`${BASE}/projects/${id}/steps/${step}`, 'POST', body)
}

export function cancelManualStep(id: string) {
  return send<VideoAgentRun>(`${BASE}/projects/${id}/cancel`, 'POST', {})
}

export function saveManualScript(id: string, text: string) {
  return send<VideoAgentRun>(`${BASE}/projects/${id}/script`, 'PUT', { text })
}

export function startManualRemake(
  id: string,
  body: { provider?: RemakeProvider; promptSetId?: string; notes?: string },
) {
  return send<RemakeJob>(`${BASE}/projects/${id}/script/remake`, 'POST', body)
}

export function importManualRemake(id: string, jobId?: string) {
  return send<VideoAgentRun>(`${BASE}/projects/${id}/script/import-remake`, 'POST', { jobId })
}

export function approveManualScript(id: string) {
  return send<VideoAgentRun>(`${BASE}/projects/${id}/approve`, 'POST', {})
}

export function openManualFolder(id: string) {
  return send<{ folder: string }>(`${BASE}/projects/${id}/open-folder`, 'POST', {})
}

export function openManualPath(path: string) {
  return send<{ folder: string }>(`${BASE}/open-path`, 'POST', { path })
}

export interface ManualSceneItem {
  index: number
  startTime: string
  endTime: string
  durationSec: number
  prompt: string
  /** Set for locally rendered chapter title cards (no AI image prompt). */
  title?: string
  references: string[]
  hasImage: boolean
  imageVersion: number
  /** The scene plays a Flow video clip instead of its still image. */
  hasClip: boolean
  clipVersion: number
}

export function fetchManualScenes(id: string, options?: FetchOptions) {
  return fetchJson<{ items: ManualSceneItem[] }>(`${BASE}/projects/${id}/scenes`, withSignal(undefined, options))
}

export function manualSceneImageUrl(id: string, scene: Pick<ManualSceneItem, 'index' | 'imageVersion'>): string {
  return `${BASE}/projects/${id}/scenes/${scene.index}/image?v=${scene.imageVersion}`
}

export function regenerateManualScene(id: string, index: number, prompt?: string) {
  return send<VideoAgentRun>(`${BASE}/projects/${id}/scenes/${index}/regenerate`, 'POST', { prompt })
}

export interface ManualNarrationSentence {
  text: string
  start: number
  end: number
}

export interface ManualNarration {
  durationSec: number
  speaker: number
  speedScale: number
  /** False when the voice track no longer lines up with the script; times are then approximate. */
  aligned: boolean
  chapters: { heading: string; start: number; end: number; sentences: ManualNarrationSentence[] }[]
}

export function fetchManualNarration(id: string, options?: FetchOptions) {
  return fetchJson<{ narration: ManualNarration | null }>(`${BASE}/projects/${id}/narration`, withSignal(undefined, options))
}

export function manualAudioUrl(id: string, version: string): string {
  return `${BASE}/projects/${id}/audio?v=${encodeURIComponent(version)}`
}

export function setManualChannel(id: string, channelId: string) {
  return send<VideoAgentRun>(`${BASE}/projects/${id}/channel`, 'PUT', { channelId })
}

export function generateManualClips(id: string, mode: ManualMotionMode, indexes?: number[]) {
  return send<VideoAgentRun>(`${BASE}/projects/${id}/motion`, 'POST', { mode, indexes })
}

export function removeManualClip(id: string, index: number) {
  return send<VideoAgentRun>(`${BASE}/projects/${id}/scenes/${index}/clip`, 'DELETE')
}

export function manualSceneClipUrl(id: string, scene: Pick<ManualSceneItem, 'index' | 'clipVersion'>): string {
  return `${BASE}/projects/${id}/scenes/${scene.index}/clip?v=${scene.clipVersion}`
}
