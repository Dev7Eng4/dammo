import {
  SS_DEFAULT_SLIDE_DURATION,
  SS_DEFAULT_TRANSITION_DURATION,
} from './slideshow.constants.js';
import { ALL_TRANSITIONS } from './slideshow-transitions.js';
import type { KenBurnsEffect, SlideSpec, TransitionType } from './slideshow.types.js';

/**
 * Complete catalog of reusable Ken Burns presets.
 *
 * Pan presets keep a moderate zoom so the focal point has room to travel;
 * the clip renderer clamps the crop window, so values are always safe.
 */
export const KEN_BURNS_PRESETS = {
  static: { zoomStart: 1.0, zoomEnd: 1.0, from: { x: 0.5, y: 0.5 }, to: { x: 0.5, y: 0.5 }, easing: 'linear' },

  zoomInCenter: { zoomStart: 1.0, zoomEnd: 1.18, from: { x: 0.5, y: 0.5 }, to: { x: 0.5, y: 0.5 }, easing: 'easeInOut' },
  zoomOutCenter: { zoomStart: 1.18, zoomEnd: 1.0, from: { x: 0.5, y: 0.5 }, to: { x: 0.5, y: 0.5 }, easing: 'easeInOut' },

  panLeft: { zoomStart: 1.3, zoomEnd: 1.3, from: { x: 0.6, y: 0.5 }, to: { x: 0.4, y: 0.5 }, easing: 'linear' },
  panRight: { zoomStart: 1.3, zoomEnd: 1.3, from: { x: 0.4, y: 0.5 }, to: { x: 0.6, y: 0.5 }, easing: 'linear' },
  panUp: { zoomStart: 1.3, zoomEnd: 1.3, from: { x: 0.5, y: 0.6 }, to: { x: 0.5, y: 0.4 }, easing: 'linear' },
  panDown: { zoomStart: 1.3, zoomEnd: 1.3, from: { x: 0.5, y: 0.4 }, to: { x: 0.5, y: 0.6 }, easing: 'linear' },

  zoomInPanTL: { zoomStart: 1.0, zoomEnd: 1.25, from: { x: 0.5, y: 0.5 }, to: { x: 0.4, y: 0.4 }, easing: 'easeInOut' },
  zoomInPanTR: { zoomStart: 1.0, zoomEnd: 1.25, from: { x: 0.5, y: 0.5 }, to: { x: 0.6, y: 0.4 }, easing: 'easeInOut' },
  zoomInPanBL: { zoomStart: 1.0, zoomEnd: 1.25, from: { x: 0.5, y: 0.5 }, to: { x: 0.4, y: 0.6 }, easing: 'easeInOut' },
  zoomInPanBR: { zoomStart: 1.0, zoomEnd: 1.25, from: { x: 0.5, y: 0.5 }, to: { x: 0.6, y: 0.6 }, easing: 'easeInOut' },

  zoomOutPanTL: { zoomStart: 1.25, zoomEnd: 1.0, from: { x: 0.4, y: 0.4 }, to: { x: 0.5, y: 0.5 }, easing: 'easeInOut' },
  zoomOutPanBR: { zoomStart: 1.25, zoomEnd: 1.0, from: { x: 0.6, y: 0.6 }, to: { x: 0.5, y: 0.5 }, easing: 'easeInOut' },
} satisfies Record<string, KenBurnsEffect>;

export type KenBurnsPresetName = keyof typeof KEN_BURNS_PRESETS;

/** Rotation order used by pickAutoEffects for a varied, natural feel. */
export const AUTO_KEN_BURNS_ROTATION: KenBurnsPresetName[] = [
  'zoomInCenter',
  'panRight',
  'zoomInPanBR',
  'zoomOutCenter',
  'panLeft',
  'zoomInPanTL',
  'panUp',
  'zoomInPanTR',
  'panDown',
  'zoomOutPanBR',
];

/** Default rotation of transitions for pickAutoEffects. */
export const AUTO_TRANSITION_ROTATION: TransitionType[] = [
  'fade',
  'dissolve',
  'slideleft',
  'circleopen',
  'wiperight',
  'smoothleft',
  'fadeblack',
  'radial',
];

export interface AutoEffectsOptions {
  durationSec?: number;
  transitionDurationSec?: number;
  /** Restrict / reorder which transitions are used. Defaults to the rotation. */
  transitions?: TransitionType[];
  /** Restrict / reorder which Ken Burns presets are used. */
  kenBurnsPresets?: KenBurnsPresetName[];
  /** Shuffle the rotations instead of using a fixed cyclic order. */
  shuffle?: boolean;
}

function shuffled<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Builds a full set of SlideSpec from image paths, assigning a varied Ken Burns
 * preset to each slide and a transition between consecutive slides without
 * repeating the same effect/transition back-to-back.
 */
export function pickAutoEffects(imagePaths: string[], opts: AutoEffectsOptions = {}): SlideSpec[] {
  const durationSec = opts.durationSec ?? SS_DEFAULT_SLIDE_DURATION;
  const transitionDurationSec = opts.transitionDurationSec ?? SS_DEFAULT_TRANSITION_DURATION;

  const kbBase = opts.kenBurnsPresets ?? AUTO_KEN_BURNS_ROTATION;
  const trBase = opts.transitions ?? AUTO_TRANSITION_ROTATION;
  const kbRotation = opts.shuffle ? shuffled(kbBase) : kbBase;
  const trRotation = opts.shuffle ? shuffled(trBase.length ? trBase : ALL_TRANSITIONS) : trBase;

  return imagePaths.map((imagePath, i) => {
    const presetName = kbRotation[i % kbRotation.length];
    const isLast = i === imagePaths.length - 1;

    const slide: SlideSpec = {
      imagePath,
      durationSec,
      kenBurns: { ...KEN_BURNS_PRESETS[presetName] },
      fit: 'cover',
    };

    if (!isLast) {
      slide.transitionToNext = trRotation[i % trRotation.length];
      slide.transitionDurationSec = transitionDurationSec;
    }

    return slide;
  });
}
