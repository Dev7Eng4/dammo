import { OFF_NICHE } from '../brains/psy-clusters.js';
import { viewShareAtAge } from './radar-scoring.js';

/**
 * Remake gates: decide whether a hot competitor video is worth remaking, with a reason for every
 * downgrade, so the Radar and the remake queues agree on what to make.
 *
 * - `skip`  (không nên làm): fails a hard gate — wrong length, off niche, too few real views.
 * - `maybe` (có thể làm): passes the hard gates but something is weak or unknown.
 * - `do`    (nên làm): strong signal, fresh, nothing doubtful.
 */
export type RemakeVerdict = 'do' | 'maybe' | 'skip';

export interface RemakeGateResult {
  verdict: RemakeVerdict;
  /** Vietnamese, one line each: why it was skipped / downgraded, or why it is a "do". */
  reasons: string[];
}

export const REMAKE_GATES = {
  /** Only remake sources whose length is inside this window (minutes, inclusive). */
  minMinutes: 10,
  maxMinutes: 35,
  /** Real views a niche video reaches once its curve flattens; the age-scaled floor is this × the curve. */
  saturationViews: 15_000,
  /** "do" needs the video to be this fresh (hours)… */
  freshHours: 72,
  /** …past this it has cooled down: never "do". */
  staleHours: 168,
  /** ×channel (expected or median) needed for "do". */
  strongRatio: 8,
  /** Trend heat needed for "do" when the channel ratio is unknown. */
  strongHeat: 80,
  /** Recent views/hour below this share of the lifetime views/hour = stalled. */
  stalledMomentum: 0.25,
} as const;

export interface RemakeGateInput {
  /** Video length in minutes; undefined = unknown. */
  minutes?: number;
  /** Age now (hours). */
  ageHours?: number;
  /** Age when `views` was measured (hours); defaults to `ageHours`. */
  measuredAgeHours?: number;
  views?: number;
  /** Views ÷ what the source channel normally gets (expected-at-age or median views/hour). */
  ratio?: number;
  /** Trend brain heat 0–100. */
  heat?: number;
  /** K1–K11, "off", or undefined when not tagged (scan radar has no cluster). */
  cluster?: string;
  clusterUnsure?: boolean;
  /** Our channels may only borrow the topic (real vlog / real famous person speaking). */
  topicOnly?: boolean;
  /** Recent views/hour ÷ lifetime views/hour, when two snapshots exist. */
  momentum?: number;
}

function fmt(value: number): string {
  return Math.round(value).toLocaleString('vi-VN');
}

/** Real views a video should have by this age to be worth remaking (niche saturation × age curve). */
export function viewFloorAtAge(ageHours: number): number {
  return REMAKE_GATES.saturationViews * viewShareAtAge(ageHours / 24);
}

export function evaluateRemakeGates(input: RemakeGateInput): RemakeGateResult {
  const g = REMAKE_GATES;
  const skips: string[] = [];
  const doubts: string[] = [];

  // Hard gates.
  if (input.minutes !== undefined && input.minutes > 0) {
    if (input.minutes < g.minMinutes || input.minutes > g.maxMinutes) {
      skips.push(`dài ${input.minutes.toFixed(1)} phút, ngoài khuôn ${g.minMinutes}–${g.maxMinutes} phút`);
    }
  } else {
    doubts.push('chưa rõ độ dài');
  }

  if (input.cluster === OFF_NICHE) skips.push('lạc ngách');

  const measuredAge = input.measuredAgeHours ?? input.ageHours;
  if (input.views !== undefined && measuredAge !== undefined && measuredAge > 0) {
    const floor = viewFloorAtAge(measuredAge);
    if (input.views < floor) {
      skips.push(`view ${fmt(input.views)} < sàn ${fmt(floor)} ở tuổi ${Math.round(measuredAge)}h`);
    }
  }

  if (skips.length > 0) return { verdict: 'skip', reasons: skips };

  // Soft gates: still makeable, but not a clear "do".
  if (input.ageHours === undefined) doubts.push('chưa rõ ngày đăng');
  else if (input.ageHours > g.staleHours) doubts.push(`đã ${Math.round(input.ageHours / 24)} ngày, đà đã nguội`);
  else if (input.ageHours > g.freshHours) doubts.push(`đã ${Math.round(input.ageHours)}h, quá ${g.freshHours}h`);

  if (input.cluster === undefined && input.heat !== undefined) doubts.push('chưa gán cụm');
  if (input.clusterUnsure) doubts.push('cụm chưa chắc');
  if (input.topicOnly) doubts.push('chỉ mượn được chủ đề (vlog thật / người thật)');
  if (input.momentum !== undefined && input.momentum < g.stalledMomentum) {
    doubts.push(`đang chững (tốc độ gần đây ×${input.momentum.toFixed(2)})`);
  }

  const strongByRatio = input.ratio !== undefined && input.ratio >= g.strongRatio;
  const strongByHeat = input.ratio === undefined && input.heat !== undefined && input.heat >= g.strongHeat;
  if (!strongByRatio && !strongByHeat) {
    if (input.ratio !== undefined) doubts.push(`×${input.ratio.toFixed(1)} kênh nguồn, chưa tới ×${g.strongRatio}`);
    else if (input.heat !== undefined) doubts.push(`heat ${Math.round(input.heat)}, chưa tới ${g.strongHeat}`);
    else doubts.push('chưa đo được độ nổ');
  }

  if (doubts.length > 0) return { verdict: 'maybe', reasons: doubts };

  const strength = strongByRatio ? `×${Math.round(input.ratio!)} kênh nguồn` : `heat ${Math.round(input.heat!)}`;
  return {
    verdict: 'do',
    reasons: [`${strength}, ${Math.round(input.ageHours!)}h tuổi, dài ${input.minutes!.toFixed(0)} phút`],
  };
}

const VERDICT_RANK: Record<RemakeVerdict, number> = { do: 0, maybe: 1, skip: 2 };

export function compareVerdicts(a: RemakeVerdict, b: RemakeVerdict): number {
  return VERDICT_RANK[a] - VERDICT_RANK[b];
}
