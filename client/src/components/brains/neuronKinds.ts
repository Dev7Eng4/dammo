import type { NeuronKind } from '../../types/brains'

export const KIND_COLOR: Record<NeuronKind, string> = {
  topic: '#f59e0b',
  video: '#60a5fa',
  keyword: '#a3e635',
  channel: '#c084fc',
  insight: '#38bdf8',
  idea: '#facc15',
  title: '#ec4899',
  pattern: '#2dd4bf',
  brief: '#22c55e',
  recipe: '#818cf8',
  schedule: '#f97316',
  metric: '#d946ef',
  action: '#fb7185',
}

/** Neuron kinds in legend order; label with `brains:kind.<kind>`. */
export const NEURON_KINDS = Object.keys(KIND_COLOR) as NeuronKind[];

/** Sections of a brain's detail panel, in display order; label with `brains:section.<kind>`. */
export const KIND_SECTIONS: NeuronKind[] = [
  'action',
  'schedule',
  'brief',
  'recipe',
  'metric',
  'idea',
  'title',
  'topic',
  'insight',
  'pattern',
  'channel',
  'video',
  'keyword',
];

export function videoIdOf(key: string): string {
  return key.replace(/^video:/, '')
}
