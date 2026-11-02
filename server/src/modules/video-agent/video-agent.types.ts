import type Anthropic from '@anthropic-ai/sdk';

export type VideoAgentRunStatus =
  /** Manual project between steps: nothing is running, the producer decides what to do next. */
  | 'draft'
  | 'queued'
  | 'running'
  | 'awaiting_approval'
  /** Server restarted mid-run; the user can resume from the last saved turn. */
  | 'interrupted'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Pipeline milestones shown as the progress rail; each one is reached by a tool.
 * `motion` (scene images turned into video clips) is an optional manual step, not on the agent's rail.
 */
export type VideoAgentStage = 'source' | 'script' | 'approval' | 'voice' | 'scenes' | 'motion' | 'video';

export const VIDEO_AGENT_STAGES: readonly VideoAgentStage[] = ['source', 'script', 'approval', 'voice', 'scenes', 'video'];

export type VideoAgentStepKind = 'thinking' | 'message' | 'tool_call' | 'tool_result' | 'system' | 'error';

export interface VideoAgentStep {
  id: string;
  at: string;
  kind: VideoAgentStepKind;
  title: string;
  detail?: string;
  toolName?: string;
  /** Set on `tool_result` steps. */
  durationMs?: number;
  isError?: boolean;
}

export interface VideoAgentUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Estimate from list prices; the Console bill is authoritative. */
  costUsd: number;
}

/** Runtime window for a finished video. The agent picks the length inside it from the material. */
export const VIDEO_MIN_MINUTES = 12;
export const VIDEO_MAX_MINUTES = 30;

export interface VideoAgentRunInput {
  sourceUrls: string[];
  channelId: string;
  /** Free-form direction for the agent (angle, things to avoid, ...). */
  notes?: string;
  voicevoxSpeaker: number;
  speedScale: number;
  /** When false the agent goes straight from script to voice. */
  requireApproval: boolean;
}

export interface VideoAgentSourceInfo {
  url: string;
  videoId: string;
  title: string;
  transcriptChars: number;
  transcriptPath: string;
}

/** How a chapter is told. Neighbouring chapters must differ, so the video does not read as one template. */
export const CHAPTER_FORMS = ['scene', 'reversal', 'dilemma', 'consultation', 'experiment', 'before_after'] as const;
export type ChapterForm = (typeof CHAPTER_FORMS)[number];

/** How a chapter starts. Neighbouring chapters must differ. */
export const OPENING_TYPES = ['in_scene', 'question', 'quote', 'concrete_detail', 'confession', 'contrast'] as const;
export type OpeningType = (typeof OPENING_TYPES)[number];

export interface VideoAgentOutlineChapter {
  heading: string;
  keyPoints: string[];
  form: ChapterForm;
  openingType: OpeningType;
  /** The small conflict of the chapter: a hesitation, a trade-off, a choice with a cost on both sides. */
  tension: string;
  /** The concrete scene in which someone does or says something and the lesson shows through it. */
  actionScene: string;
}

/** What holds the whole video together and what the video adds that the sources do not have. */
export interface VideoAgentSpine {
  /** One question the video answers only fully at the end; every chapter answers a part. */
  centralQuestion: string;
  /** A recurring object, phrase or situation that changes meaning chapter by chapter. */
  thread: string;
  /** What every source video says. */
  consensus: string;
  /** Where this video deliberately goes deeper or differently. */
  ourTake: string;
  /** Concrete elements (scenes, reframings, practical steps, Japanese everyday anchors) found in no source. */
  originalElements: string[];
}

/** The agent's own design for the video; the script writer expands it chapter by chapter. */
export interface VideoAgentOutline {
  title: string;
  angle: string;
  hook: string;
  spine: VideoAgentSpine;
  chapters: VideoAgentOutlineChapter[];
}

export interface VideoAgentScriptChapter {
  heading: string;
  sentences: string[];
}

/** Editor pass over the whole script: structural copying, repetition, chapter hand-offs, arc. */
export interface VideoAgentScriptReview {
  sources: {
    sourceIndex: number;
    sharedStructurePercent: number;
    reusedExamples: string[];
    reason: string;
    pass: boolean;
  }[];
  repetitions: { chapterA: number; chapterB: number; what: string }[];
  transitions: { fromChapter: number; smooth: boolean; note: string }[];
  arc: { builds: boolean; note: string };
  /** Per chapter: told through action or explanation, concrete or generic, true to its planned form. */
  chapters: { chapter: number; mode: 'action' | 'explanation'; hasSpecificDetail: boolean; formFollowed: boolean; note: string }[];
  /** Each planned original element checked against the script and against the sources. */
  originality: { element: string; inScript: boolean; inSources: boolean }[];
  thread: { inEveryChapter: boolean; meaningShifts: boolean; note: string };
  pass: boolean;
}

export type VideoAgentFreshnessKind = 'content' | 'title' | 'structure' | 'claim';

/** Deterministic checks of this video against the channel's earlier videos and against risky phrasing. */
export interface VideoAgentFreshness {
  /** Earlier videos of the same channel that were compared. */
  compared: number;
  issues: { kind: VideoAgentFreshnessKind; message: string }[];
  pass: boolean;
}

export interface VideoAgentScript {
  outline: VideoAgentOutline;
  chapters: VideoAgentScriptChapter[];
  /** Runtime the agent chose for this video, within VIDEO_MIN_MINUTES..VIDEO_MAX_MINUTES. */
  plannedMinutes: number;
  /** Why the agent chose that runtime (what the material supports), in Vietnamese. */
  lengthReason: string;
  totalChars: number;
  /** At the narration pace used for planning (~330 chars/min). */
  estimatedMinutes: number;
  similarity: VideoAgentSimilarity[];
  review?: VideoAgentScriptReview;
  freshness?: VideoAgentFreshness;
  updatedAt: string;
}

/** Real narration length measured after VOICEVOX, used to tune the script to the target. */
export interface VideoAgentNarrationFit {
  actualMinutes: number;
  targetMinutes: number;
  deviationPercent: number;
  charsPerMinute: number;
  chapters: { chars: number; seconds: number }[];
}

export interface VideoAgentSimilarity {
  sourceVideoId: string;
  /** % of the script's character n-grams that also appear in the source. */
  gram8: number;
  gram15: number;
}

export interface VideoAgentApproval {
  toolUseId: string;
  summary: string;
  requestedAt: string;
}

export interface VideoAgentArtifacts {
  sources: VideoAgentSourceInfo[];
  scriptPath?: string;
  audioPath?: string;
  subtitlePath?: string;
  audioDurationSec?: number;
  narrationFit?: VideoAgentNarrationFit;
  /** `provisional`: scenes were cut on estimated timing before any voice; re-timed to `voice` once it exists. */
  sceneTimingBasis?: 'provisional' | 'voice';
  scenePromptsPath?: string;
  sceneCount?: number;
  imagesGenerated?: number;
  /** Scenes that play a video clip instead of a still image. */
  clipsGenerated?: number;
  videoPath?: string;
}

export interface VideoAgentRun {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** `manual`: the producer runs each step by hand; same folder and pipeline as an agent run. Missing = `agent`. */
  mode?: 'agent' | 'manual';
  /** Manual projects: every step running right now (voice and images can overlap). */
  activeStages?: VideoAgentStage[];
  /** Manual projects: the browser-LLM remake job whose result can be imported as the script. */
  remakeJobId?: string;
  status: VideoAgentRunStatus;
  input: VideoAgentRunInput;
  channelName: string;
  model: string;
  /** Title the agent settled on, once a script exists. */
  title?: string;
  stagesDone: VideoAgentStage[];
  currentStage?: VideoAgentStage;
  steps: VideoAgentStep[];
  usage: VideoAgentUsage;
  artifacts: VideoAgentArtifacts;
  script?: VideoAgentScript;
  pendingApproval?: VideoAgentApproval;
  /** Results of tools that ran in the same turn as `request_approval`, sent back together on resume. */
  heldToolResults?: Anthropic.Beta.BetaToolResultBlockParam[];
  turns: number;
  error?: string;
  finalSummary?: string;
}

/** List row without the heavy timeline/script. */
export type VideoAgentRunSummary = Omit<VideoAgentRun, 'steps' | 'script' | 'heldToolResults'> & {
  stepCount: number;
};
