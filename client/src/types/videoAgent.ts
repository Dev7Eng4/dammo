export type VideoAgentRunStatus =
  | 'draft'
  | 'queued'
  | 'running'
  | 'awaiting_approval'
  | 'interrupted'
  | 'completed'
  | 'failed'
  | 'cancelled'

/** `motion` (images turned into video clips) is an optional manual step, not on the agent's rail. */
export type VideoAgentStage = 'source' | 'script' | 'approval' | 'voice' | 'scenes' | 'motion' | 'video'

export const VIDEO_AGENT_STAGES: readonly VideoAgentStage[] = ['source', 'script', 'approval', 'voice', 'scenes', 'video']

export type VideoAgentStepKind = 'thinking' | 'message' | 'tool_call' | 'tool_result' | 'system' | 'error'

export interface VideoAgentStep {
  id: string
  at: string
  kind: VideoAgentStepKind
  title: string
  detail?: string
  toolName?: string
  durationMs?: number
  isError?: boolean
}

export interface VideoAgentUsage {
  calls: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costUsd: number
}

export interface VideoAgentRunInput {
  sourceUrls: string[]
  channelId: string
  notes?: string
  voicevoxSpeaker: number
  speedScale: number
  requireApproval: boolean
}

export interface VideoAgentSourceInfo {
  url: string
  videoId: string
  title: string
  transcriptChars: number
}

export interface VideoAgentOutline {
  title: string
  angle: string
  hook: string
  spine?: {
    centralQuestion: string
    thread: string
    consensus: string
    ourTake: string
    originalElements: string[]
  }
  chapters: { heading: string; keyPoints: string[]; form?: string; openingType?: string; tension?: string; actionScene?: string }[]
}

export interface VideoAgentScriptReview {
  sources: {
    sourceIndex: number
    sharedStructurePercent: number
    reusedExamples: string[]
    reason: string
    pass: boolean
  }[]
  repetitions: { chapterA: number; chapterB: number; what: string }[]
  transitions: { fromChapter: number; smooth: boolean; note: string }[]
  arc: { builds: boolean; note: string }
  chapters: { chapter: number; mode: 'action' | 'explanation'; hasSpecificDetail: boolean; formFollowed: boolean; note: string }[]
  originality: { element: string; inScript: boolean; inSources: boolean }[]
  thread: { inEveryChapter: boolean; meaningShifts: boolean; note: string }
  pass: boolean
}

export interface VideoAgentFreshness {
  compared: number
  issues: { kind: 'content' | 'title' | 'structure' | 'claim'; message: string }[]
  pass: boolean
}

export interface VideoAgentScript {
  outline: VideoAgentOutline
  chapters: { heading: string; sentences: string[] }[]
  plannedMinutes?: number
  lengthReason?: string
  totalChars: number
  estimatedMinutes: number
  similarity: { sourceVideoId: string; gram8: number; gram15: number }[]
  review?: VideoAgentScriptReview
  freshness?: VideoAgentFreshness
  updatedAt: string
}

export interface VideoAgentNarrationFit {
  actualMinutes: number
  targetMinutes: number
  deviationPercent: number
  charsPerMinute: number
  chapters: { chars: number; seconds: number }[]
}

export interface VideoAgentArtifacts {
  sources: VideoAgentSourceInfo[]
  scriptPath?: string
  audioPath?: string
  subtitlePath?: string
  audioDurationSec?: number
  narrationFit?: VideoAgentNarrationFit
  sceneTimingBasis?: 'provisional' | 'voice'
  sceneCount?: number
  imagesGenerated?: number
  clipsGenerated?: number
  videoPath?: string
}

export interface VideoAgentRunSummary {
  id: string
  createdAt: string
  updatedAt: string
  /** `manual`: run step by step by the producer. Missing means `agent`. */
  mode?: 'agent' | 'manual'
  /** Manual projects: every step running right now (voice and images can overlap). */
  activeStages?: VideoAgentStage[]
  remakeJobId?: string
  status: VideoAgentRunStatus
  input: VideoAgentRunInput
  channelName: string
  model: string
  title?: string
  stagesDone: VideoAgentStage[]
  currentStage?: VideoAgentStage
  usage: VideoAgentUsage
  artifacts: VideoAgentArtifacts
  pendingApproval?: { toolUseId: string; summary: string; requestedAt: string }
  turns: number
  error?: string
  finalSummary?: string
  stepCount: number
}

export interface VideoAgentRun extends Omit<VideoAgentRunSummary, 'stepCount'> {
  steps: VideoAgentStep[]
  script?: VideoAgentScript
}

export interface CreateVideoAgentRunPayload {
  sourceUrls: string[]
  channelId: string
  notes?: string
  voicevoxSpeaker?: number
  speedScale?: number
  requireApproval?: boolean
}

export interface VoicevoxStatus {
  available: boolean
  url: string
  defaultSpeaker: number
  speakers: { name: string; styles: { id: number; name: string }[] }[]
  error?: string
}

export interface VideoAgentConfig {
  model: string
  apiKeyConfigured: boolean
  maxTurns: number
}

export type VideoAgentEvent =
  | { type: 'run_updated'; run: VideoAgentRunSummary }
  | { type: 'step_appended'; runId: string; step: VideoAgentStep }
  | { type: 'run_removed'; runId: string }
