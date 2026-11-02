import type { PromptLanguage } from '../types/prompt';
import type { TranscriptLanguage } from './contentDownload';
import { API_V1 } from './config';
import { fetchJson, withSignal, type FetchOptions } from './http';

const BASE = `${API_V1}/script-remake`;

export type RemakeProvider = 'gpt' | 'gemini';

export interface RemakeOutline {
  title: string;
  angle: string;
  hook: string;
  chapters: { heading: string; keyPoints: string[] }[];
}

export interface RemakeResult {
  outline: RemakeOutline;
  chapters: { heading: string; sentences: string[] }[];
  plannedMinutes: number;
  lengthReason: string;
  totalChars: number;
  estimatedMinutes: number;
  similarity: { gram8: number; gram15: number };
  outputPath: string;
  relativeOutputPath: string;
}

export interface RemakeJob {
  id: string;
  status: 'running' | 'done' | 'failed';
  startedAt: string;
  finishedAt?: string;
  relativePath: string;
  /** Runtime the LLM chose (12-30 min); set once its plan is accepted. */
  plannedMinutes?: number;
  lengthReason?: string;
  provider: RemakeProvider;
  promptSetName?: string;
  profileName?: string;
  progress?: string;
  logs: { at: string; message: string }[];
  result?: RemakeResult;
  error?: string;
}

export interface StartRemakePayload {
  relativePath: string;
  language: TranscriptLanguage;
  notes?: string;
  promptSetId?: string;
  provider?: RemakeProvider;
}

export function fetchRemakePromptSets(language: TranscriptLanguage, options?: FetchOptions) {
  return fetchJson<{ items: RemakePromptSet[] }>(`${BASE}/prompts?language=${language}`, withSignal(undefined, options));
}

export function startRemake(payload: StartRemakePayload) {
  return fetchJson<RemakeJob>(`${BASE}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function fetchRemakeJob(id: string, options?: FetchOptions) {
  return fetchJson<RemakeJob>(`${BASE}/jobs/${id}`, withSignal(undefined, options));
}

/** Server-side prompt set as returned by GET /script-remake/prompts (only the fields the page uses). */
export interface RemakePromptSet {
  id: string;
  name: string;
  language: PromptLanguage;
}
