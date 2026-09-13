import { formatElapsedMs } from './format-elapsed.js';
import { beginPhase } from './run-timeline.js';

export { formatElapsedMs };

export interface TimedStepOptions {
  prefix?: string;
  onLog?: (msg: string) => void;
  /** Phase this step is filed under in the run report. Defaults to the label. */
  timelineGroup?: string;
}

function formatStepMessage(prefix: string | undefined, label: string, suffix?: string): string {
  const base = prefix ? `${prefix} ${label}` : label;
  return suffix ? `${base} — ${suffix}` : `${base}...`;
}

function emitLog(msg: string, onLog?: (msg: string) => void): void {
  console.log(msg);
  onLog?.(msg);
}

export async function timedStep<T>(
  label: string,
  fn: () => Promise<T>,
  options?: TimedStepOptions,
): Promise<T> {
  const { prefix, onLog, timelineGroup } = options ?? {};
  const startedAt = performance.now();
  const endSpan = beginPhase(timelineGroup ?? label, label);
  emitLog(formatStepMessage(prefix, label), onLog);

  try {
    const result = await fn();
    endSpan();
    emitLog(formatStepMessage(prefix, label, formatElapsedMs(performance.now() - startedAt)), onLog);
    return result;
  } catch (err) {
    endSpan(true);
    emitLog(formatStepMessage(prefix, label, `FAILED sau ${formatElapsedMs(performance.now() - startedAt)}`), onLog);
    throw err;
  }
}
