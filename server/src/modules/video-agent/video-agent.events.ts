import type { VideoAgentRunSummary, VideoAgentStep } from './video-agent.types.js';

export type VideoAgentEvent =
  | { type: 'run_updated'; run: VideoAgentRunSummary }
  | { type: 'step_appended'; runId: string; step: VideoAgentStep }
  | { type: 'run_removed'; runId: string };

const listeners = new Set<(event: VideoAgentEvent) => void>();

export function emitVideoAgentEvent(event: VideoAgentEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}

export function onVideoAgentEvent(listener: (event: VideoAgentEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
