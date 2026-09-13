import { AsyncLocalStorage } from 'node:async_hooks';
import { formatElapsedMs } from './format-elapsed.js';

export interface TimelineSpan {
  /** Top-level phase the span belongs to, e.g. `scene images`. */
  group: string;
  /** What happened inside the phase, e.g. `flow batch`. Aggregated by name. */
  name: string;
  startedAt: number;
  endedAt?: number;
  failed?: boolean;
}

interface GroupSummary {
  group: string;
  firstStart: number;
  lastEnd: number;
  /** Time the phase occupied on the clock, overlap collapsed. */
  wallMs: number;
  /** Time its spans add up to — larger than `wallMs` when work ran in parallel. */
  sumMs: number;
  children: ChildSummary[];
}

interface ChildSummary {
  name: string;
  count: number;
  totalMs: number;
  maxMs: number;
  failed: number;
}

/**
 * Spans that wholly contain another span of the same group.
 *
 * Instrumentation nests — a phase wrapper around the loop it runs — and adding
 * a wrapper to its own children would report every nesting as parallelism.
 * Only the innermost spans are summed; the wrapper still counts toward the
 * group's wall time, which it is already covered by.
 */
function containerSpans(spans: TimelineSpan[], now: number): Set<TimelineSpan> {
  const containers = new Set<TimelineSpan>();

  for (const outer of spans) {
    const outerEnd = outer.endedAt ?? now;
    for (const inner of spans) {
      if (inner === outer) continue;
      const innerEnd = inner.endedAt ?? now;
      const contained = inner.startedAt >= outer.startedAt && innerEnd <= outerEnd;
      // A tie on both edges would mark each as the other's container.
      const strictly = contained && (inner.startedAt > outer.startedAt || innerEnd < outerEnd);
      if (strictly) {
        containers.add(outer);
        break;
      }
    }
  }

  return containers;
}

/** Union of the spans' covered time, so parallel work is not counted twice. */
function unionMs(spans: TimelineSpan[], now: number): number {
  const ranges = spans
    .map(span => [span.startedAt, span.endedAt ?? now] as const)
    .sort((a, b) => a[0] - b[0]);

  let total = 0;
  let cursorStart = -Infinity;
  let cursorEnd = -Infinity;

  for (const [start, end] of ranges) {
    if (start > cursorEnd) {
      if (cursorEnd > cursorStart) total += cursorEnd - cursorStart;
      cursorStart = start;
      cursorEnd = end;
      continue;
    }
    cursorEnd = Math.max(cursorEnd, end);
  }
  if (cursorEnd > cursorStart) total += cursorEnd - cursorStart;

  return total;
}

/**
 * Collects how long each part of one video run took.
 *
 * Every span records its own start and end rather than just a duration, so the
 * report can separate the time a phase occupied on the clock from the time its
 * work adds up to. The two differ wherever the pipeline runs things in
 * parallel — several Chrome profiles on scene prompts, the Ken Burns prebake
 * overlapping image generation — and that gap is the whole point of measuring.
 */
export class RunTimeline {
  readonly label: string;
  private readonly startedAt: number;
  private readonly spans: TimelineSpan[] = [];
  private readonly counters = new Map<string, number>();

  constructor(label: string) {
    this.label = label;
    this.startedAt = performance.now();
  }

  /** Opens a span; call the returned function when the work finishes. */
  begin(group: string, name: string): (failed?: boolean) => void {
    const span: TimelineSpan = { group, name, startedAt: performance.now() };
    this.spans.push(span);

    return (failed?: boolean) => {
      if (span.endedAt !== undefined) return;
      span.endedAt = performance.now();
      if (failed) span.failed = true;
    };
  }

  async measure<T>(group: string, name: string, fn: () => Promise<T>): Promise<T> {
    const end = this.begin(group, name);
    try {
      const result = await fn();
      end();
      return result;
    } catch (err) {
      end(true);
      throw err;
    }
  }

  /** Non-timing tallies worth seeing next to the durations (cache hits, retries). */
  count(name: string, by = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + by);
  }

  get elapsedMs(): number {
    return performance.now() - this.startedAt;
  }

  private summarise(now: number): GroupSummary[] {
    const byGroup = new Map<string, TimelineSpan[]>();
    for (const span of this.spans) {
      const list = byGroup.get(span.group);
      if (list) list.push(span);
      else byGroup.set(span.group, [span]);
    }

    const summaries: GroupSummary[] = [];

    for (const [group, spans] of byGroup) {
      const byName = new Map<string, ChildSummary>();
      const containers = containerSpans(spans, now);
      let sumMs = 0;

      for (const span of spans) {
        const ms = (span.endedAt ?? now) - span.startedAt;
        if (!containers.has(span)) sumMs += ms;

        const child = byName.get(span.name);
        if (child) {
          child.count += 1;
          child.totalMs += ms;
          child.maxMs = Math.max(child.maxMs, ms);
          if (span.failed) child.failed += 1;
        } else {
          byName.set(span.name, {
            name: span.name,
            count: 1,
            totalMs: ms,
            maxMs: ms,
            failed: span.failed ? 1 : 0,
          });
        }
      }

      summaries.push({
        group,
        firstStart: Math.min(...spans.map(span => span.startedAt)),
        lastEnd: Math.max(...spans.map(span => span.endedAt ?? now)),
        wallMs: unionMs(spans, now),
        sumMs,
        children: [...byName.values()].sort((a, b) => b.totalMs - a.totalMs),
      });
    }

    return summaries.sort((a, b) => a.firstStart - b.firstStart);
  }

  /** Multi-line breakdown, ready to hand to a logger. */
  report(): string {
    const now = performance.now();
    const totalMs = now - this.startedAt;
    const groups = this.summarise(now);
    const lines: string[] = [];

    lines.push(`=== Timing ${this.label} — tổng ${formatElapsedMs(totalMs)} ===`);

    for (const group of groups) {
      const share = totalMs > 0 ? (group.wallMs / totalMs) * 100 : 0;
      const parallel = group.wallMs > 0 ? group.sumMs / group.wallMs : 1;
      const parallelNote = parallel >= 1.15 ? `  [song song x${parallel.toFixed(1)}, cộng dồn ${formatElapsedMs(group.sumMs)}]` : '';

      const failures = group.children.reduce((sum, child) => sum + child.failed, 0);
      const failureNote = failures > 0 ? `  (${failures} lỗi)` : '';

      lines.push(
        `  ${group.group.padEnd(26)} ${formatElapsedMs(group.wallMs).padStart(8)}  ${share.toFixed(1).padStart(5)}%${failureNote}${parallelNote}`,
      );

      // One span that neither repeated nor failed says nothing the group line did not.
      const worthDetailing = group.children.length > 1 || group.children[0]?.count > 1 || failures > 0;
      if (!worthDetailing) continue;

      for (const child of group.children) {
        const avg = child.totalMs / child.count;
        const detail =
          child.count > 1
            ? `${String(child.count).padStart(3)}x  tổng ${formatElapsedMs(child.totalMs)}, tb ${formatElapsedMs(avg)}, max ${formatElapsedMs(child.maxMs)}`
            : `     ${formatElapsedMs(child.totalMs)}`;
        const failed = child.failed > 0 ? `  (${child.failed} lỗi)` : '';
        lines.push(`      ${child.name.padEnd(24)} ${detail}${failed}`);
      }
    }

    /* Phases that literally overlap on the clock — the prebake is meant to. */
    const overlaps: string[] = [];
    for (let i = 0; i < groups.length; i += 1) {
      for (let j = i + 1; j < groups.length; j += 1) {
        const a = groups[i];
        const b = groups[j];
        const shared = Math.min(a.lastEnd, b.lastEnd) - Math.max(a.firstStart, b.firstStart);
        if (shared > 1000) {
          overlaps.push(`${a.group} ∩ ${b.group} = ${formatElapsedMs(shared)}`);
        }
      }
    }
    if (overlaps.length > 0) {
      lines.push(`  chồng lấn: ${overlaps.join('; ')}`);
    }

    if (this.counters.size > 0) {
      const counts = [...this.counters.entries()].map(([name, value]) => `${name}=${value}`).join(', ');
      lines.push(`  đếm: ${counts}`);
    }

    return lines.join('\n');
  }
}

const storage = new AsyncLocalStorage<RunTimeline>();

/** Runs `fn` with `timeline` visible to every async call it makes. */
export function runWithTimeline<T>(timeline: RunTimeline, fn: () => Promise<T>): Promise<T> {
  return storage.run(timeline, fn);
}

export function currentTimeline(): RunTimeline | undefined {
  return storage.getStore();
}

/**
 * Records a span on the active timeline, or just runs `fn` when nothing is
 * measuring — so deep modules can be instrumented without every caller having
 * to thread a timeline through.
 */
export function timedPhase<T>(group: string, name: string, fn: () => Promise<T>): Promise<T> {
  const timeline = storage.getStore();
  return timeline ? timeline.measure(group, name, fn) : fn();
}

/** Manual span for work that is not a single awaited call (pools, queues). */
export function beginPhase(group: string, name: string): (failed?: boolean) => void {
  return storage.getStore()?.begin(group, name) ?? (() => undefined);
}

export function countEvent(name: string, by = 1): void {
  storage.getStore()?.count(name, by);
}

/** The run breakdown split into lines, ready to feed a line-based logger. */
export function reportLines(timeline: RunTimeline): string[] {
  return timeline.report().split('\n');
}
