export type BrainStatus = 'idle' | 'running' | 'error' | 'dormant'
export type NeuronKind =
  | 'topic'
  | 'video'
  | 'keyword'
  | 'channel'
  | 'insight'
  | 'idea'
  | 'title'
  | 'pattern'
  | 'brief'
  | 'recipe'
  | 'schedule'
  | 'metric'
  | 'action'
export type PulseKind = 'start' | 'think' | 'search' | 'found' | 'error' | 'done'

export interface Brain {
  id: string
  name: string
  department: string
  color: string
  description: string
  active: boolean
  feeds: string[]
  status: BrainStatus
  lastRunAt?: string
  lastError?: string
  autoIntervalHours: number
  runs: number
  usage: { calls: number; inputTokens: number; outputTokens: number; costUsd: number }
  neuronCount: number
}

export interface Neuron {
  id: string
  brainId: string
  kind: NeuronKind
  key: string
  label: string
  labelJa?: string
  detail: string
  heat: number
  hits: number
  url?: string
  meta?: Record<string, string | number | string[]>
  links: string[]
  firstSeenAt: string
  lastSeenAt: string
}

export interface Pulse {
  id: string
  brainId: string
  runId: string
  at: string
  kind: PulseKind
  text: string
}

export interface PipelineStatus {
  running: boolean
  current?: string
  order: string[]
}

export interface BrainsSnapshot {
  brains: Brain[]
  pipeline: PipelineStatus
  neurons: Neuron[]
  pulses: Pulse[]
  stats: { pulses24h: number; errors24h: number }
}

export type BrainEvent =
  | { type: 'brain_updated'; brain: Brain }
  | { type: 'pulse'; pulse: Pulse }
  | { type: 'neurons'; brainId: string; neurons: Neuron[] }
  | ({ type: 'pipeline' } & PipelineStatus)
