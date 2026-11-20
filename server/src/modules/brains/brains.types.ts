/** A brain is one AI agent with its own job, memory (neurons) and activity log (pulses). */
export type BrainStatus = 'idle' | 'running' | 'error' | 'dormant';

export const NEURON_KINDS = [
  'topic',
  'video',
  'keyword',
  'channel',
  'insight',
  'idea',
  'title',
  'pattern',
  /** Script brief: a ready-to-produce plan for one video. */
  'brief',
  /** Production setting recommended for a channel (voice, visuals, edit). */
  'recipe',
  /** Proposed publishing slot or calendar entry. */
  'schedule',
  /** Measured performance of an own channel or video. */
  'metric',
  /** Growth action the producer can take. */
  'action',
] as const;
export type NeuronKind = (typeof NEURON_KINDS)[number];

export type PulseKind = 'start' | 'think' | 'search' | 'found' | 'error' | 'done';

export interface BrainUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface BrainState {
  id: string;
  status: BrainStatus;
  lastRunAt?: string;
  lastRunId?: string;
  lastError?: string;
  /** Hours between automatic runs; 0 = manual only. */
  autoIntervalHours: number;
  runs: number;
  usage: BrainUsage;
}

export interface Neuron {
  id: string;
  brainId: string;
  kind: NeuronKind;
  /** Stable key used to merge repeated findings (e.g. video id, normalized topic). */
  key: string;
  label: string;
  /** Japanese label / original title. */
  labelJa?: string;
  detail: string;
  /** 0-100: how hot the finding is right now. */
  heat: number;
  hits: number;
  url?: string;
  meta?: Record<string, string | number | string[]>;
  /** Neuron keys this one is linked to (topic ↔ video evidence). */
  links: string[];
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface Pulse {
  id: string;
  brainId: string;
  runId: string;
  at: string;
  kind: PulseKind;
  text: string;
}

export interface BrainsStore {
  brains: Record<string, BrainState>;
  neurons: Neuron[];
  pulses: Pulse[];
}

export interface BrainDefinition {
  id: string;
  name: string;
  /** Department in the pipeline, shown as the colour group. */
  department: string;
  color: string;
  description: string;
  /** False = planned brain, shown on the map but not runnable yet. */
  active: boolean;
  /** Brains whose memory this one reads. */
  feeds: string[];
}

export interface BrainView extends BrainDefinition, BrainState {
  neuronCount: number;
}
