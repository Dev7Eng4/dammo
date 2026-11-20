import type { BrainView, Neuron, Pulse } from './brains.types.js';

export type BrainEvent =
  | { type: 'brain_updated'; brain: BrainView }
  | { type: 'pulse'; pulse: Pulse }
  | { type: 'neurons'; brainId: string; neurons: Neuron[] }
  | { type: 'pipeline'; running: boolean; current?: string; order: string[] };

const listeners = new Set<(event: BrainEvent) => void>();

export function emitBrainEvent(event: BrainEvent): void {
  for (const listener of listeners) listener(event);
}

export function onBrainEvent(listener: (event: BrainEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
