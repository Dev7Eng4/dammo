export function formatElapsedMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '?';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export interface TimedStepOptions {
  prefix?: string;
  onLog?: (msg: string) => void;
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
  const { prefix, onLog } = options ?? {};
  const startedAt = performance.now();
  emitLog(formatStepMessage(prefix, label), onLog);

  try {
    const result = await fn();
    emitLog(formatStepMessage(prefix, label, formatElapsedMs(performance.now() - startedAt)), onLog);
    return result;
  } catch (err) {
    emitLog(formatStepMessage(prefix, label, `FAILED sau ${formatElapsedMs(performance.now() - startedAt)}`), onLog);
    throw err;
  }
}
