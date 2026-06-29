import type { TransitionType } from './slideshow.types.js';

/**
 * Curated set of ffmpeg `xfade` transitions that look good for photo slideshows.
 * (xfade ships 50+ effects; these are the reliable, non-gimmicky ones.)
 */
export const ALL_TRANSITIONS: TransitionType[] = [
  'fade',
  'fadeblack',
  'fadewhite',
  'dissolve',
  'wipeleft',
  'wiperight',
  'wipeup',
  'wipedown',
  'slideleft',
  'slideright',
  'slideup',
  'slidedown',
  'circlecrop',
  'circleopen',
  'circleclose',
  'radial',
  'pixelize',
  'zoomin',
  'smoothleft',
  'smoothright',
];

export interface ChainTransition {
  type: TransitionType;
  durationSec: number;
}

export interface BuildXfadeChainParams {
  /** Number of input clips (each provided to ffmpeg as a separate input). */
  clipCount: number;
  /** Visible duration of each clip, in seconds (length === clipCount). */
  durations: number[];
  /** Transitions between consecutive clips (length === clipCount - 1). */
  transitions: ChainTransition[];
}

export interface XfadeChainResult {
  /** filter_complex fragment producing `outLabel`. May be empty for 1 clip. */
  filter: string;
  /** Label carrying the final composited video stream. */
  outLabel: string;
  /** Total duration of the resulting stream in seconds. */
  totalDuration: number;
}

/**
 * Builds the chained `xfade` filtergraph that crossfades N clips together.
 *
 * Offsets accumulate because every xfade output starts at t=0:
 *   offset_i = sum(durations[0..i]) - sum(transitionDurations[0..i])
 * and the final stream length is sum(durations) - sum(transitionDurations).
 *
 * Input clip `i` is expected at filtergraph label `${i}:v`.
 */
export function buildXfadeChain(params: BuildXfadeChainParams): XfadeChainResult {
  const { clipCount, durations, transitions } = params;

  if (clipCount <= 0) {
    throw new Error('buildXfadeChain requires at least one clip');
  }
  if (durations.length !== clipCount) {
    throw new Error('durations length must equal clipCount');
  }
  if (clipCount > 1 && transitions.length !== clipCount - 1) {
    throw new Error('transitions length must equal clipCount - 1');
  }

  if (clipCount === 1) {
    return { filter: '', outLabel: '0:v', totalDuration: durations[0] };
  }

  const parts: string[] = [];
  let prevLabel = '0:v';

  for (let i = 0; i < transitions.length; i++) {
    // Clamp transition so it never exceeds either neighbouring clip.
    const maxTrans = Math.min(durations[i], durations[i + 1]);
    const transDur = Math.min(transitions[i].durationSec, maxTrans);

    // offset_i = sum(durations[0..i]) - sum(clampedTransitions[0..i])
    const offsetSec = sumRange(durations, 0, i) - sumTransitions(transitions, 0, i, durations);
    const outLabel = i === transitions.length - 1 ? 'xfout' : `xf${i}`;

    parts.push(
      `[${prevLabel}][${i + 1}:v]xfade=transition=${transitions[i].type}:` +
        `duration=${transDur.toFixed(4)}:offset=${offsetSec.toFixed(4)}[${outLabel}]`,
    );
    prevLabel = outLabel;
  }

  const totalDuration = sumRange(durations, 0, clipCount - 1) - sumAllTransitions(transitions, durations);

  return { filter: parts.join(';'), outLabel: prevLabel, totalDuration };
}

/** Sum of durations[from..to] inclusive. */
function sumRange(durations: number[], from: number, to: number): number {
  let s = 0;
  for (let i = from; i <= to; i++) s += durations[i];
  return s;
}

/** Sum of clamped transition durations[from..to] inclusive. */
function sumTransitions(
  transitions: ChainTransition[],
  from: number,
  to: number,
  durations: number[],
): number {
  let s = 0;
  for (let i = from; i <= to; i++) {
    const maxTrans = Math.min(durations[i], durations[i + 1]);
    s += Math.min(transitions[i].durationSec, maxTrans);
  }
  return s;
}

function sumAllTransitions(transitions: ChainTransition[], durations: number[]): number {
  return sumTransitions(transitions, 0, transitions.length - 1, durations);
}
