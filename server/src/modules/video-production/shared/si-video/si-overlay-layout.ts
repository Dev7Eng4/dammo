import {
  SI_OVERLAY_EDGE_MARGIN_MAX_PX,
  SI_OVERLAY_EDGE_MARGIN_MIN_PX,
  SI_OVERLAY_MID_Y_JITTER_MAX_PX,
  SI_OVERLAY_MID_Y_JITTER_MIN_PX,
} from './si.constants.js';

export type SiOverlaySlot = 'topLeft' | 'topRight' | 'midLeft' | 'midRight';
export type SiOverlaySide = 'left' | 'right';
export type SiCenterImageShift = 'none' | 'left' | 'right';
export type SiMovableOverlayKind = 'audioBar' | 'subscribe' | 'smallVideo';

export interface SiOverlayPosition {
  x: string;
  y: string;
  slot: SiOverlaySlot;
  edgeMarginX: number;
  edgeMarginY: number;
}

const ALL_SLOTS: SiOverlaySlot[] = ['topLeft', 'topRight', 'midLeft', 'midRight'];
const SLOTS_WITHOUT_TOP_RIGHT: SiOverlaySlot[] = ['topLeft', 'midLeft', 'midRight'];

const SLOT_SIDE: Record<SiOverlaySlot, SiOverlaySide> = {
  topLeft: 'left',
  midLeft: 'left',
  topRight: 'right',
  midRight: 'right',
};

function randomIntInclusive(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Margin / vertical expressions with randomized edge insets. */
export function resolveSiOverlaySlotPosition(
  slot: SiOverlaySlot,
  edgeMarginX = 25,
  edgeMarginY = 25,
): { x: string; y: string } {
  switch (slot) {
    case 'topLeft':
      return { x: String(edgeMarginX), y: String(edgeMarginY) };
    case 'topRight':
      return { x: `W-w-${edgeMarginX}`, y: String(edgeMarginY) };
    case 'midLeft':
      return { x: String(edgeMarginX), y: `(main_h-overlay_h)/2+${edgeMarginY}` };
    case 'midRight':
      return { x: `W-w-${edgeMarginX}`, y: `(main_h-overlay_h)/2+${edgeMarginY}` };
  }
}

function randomMarginsForSlot(slot: SiOverlaySlot): { edgeMarginX: number; edgeMarginY: number } {
  const edgeMarginX = randomIntInclusive(SI_OVERLAY_EDGE_MARGIN_MIN_PX, SI_OVERLAY_EDGE_MARGIN_MAX_PX);
  const edgeMarginY =
    slot === 'midLeft' || slot === 'midRight'
      ? randomIntInclusive(SI_OVERLAY_MID_Y_JITTER_MIN_PX, SI_OVERLAY_MID_Y_JITTER_MAX_PX)
      : randomIntInclusive(SI_OVERLAY_EDGE_MARGIN_MIN_PX, SI_OVERLAY_EDGE_MARGIN_MAX_PX);
  return { edgeMarginX, edgeMarginY };
}

export function sideForSiOverlaySlot(slot: SiOverlaySlot): SiOverlaySide {
  return SLOT_SIDE[slot];
}

function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return items;
}

export interface AssignSiOverlayLayoutInput {
  hasAvatar: boolean;
  movable: SiMovableOverlayKind[];
}

export interface SiOverlayLayoutResult {
  assignments: Partial<Record<SiMovableOverlayKind, SiOverlaySlot>>;
  positions: Partial<Record<SiMovableOverlayKind, SiOverlayPosition>>;
  centerImageShift: SiCenterImageShift;
}

/**
 * Randomly assign movable overlays to free slots, then randomize edge margins.
 * Avatar (when present) always occupies top-right and removes that slot from the pool.
 * Center image shifts opposite when 1–2 movables all sit on the same side.
 */
export function assignSiOverlayLayout(input: AssignSiOverlayLayoutInput): SiOverlayLayoutResult {
  const movable = [...new Set(input.movable)];
  const pool = shuffleInPlace([...(input.hasAvatar ? SLOTS_WITHOUT_TOP_RIGHT : ALL_SLOTS)]);
  const assignments: Partial<Record<SiMovableOverlayKind, SiOverlaySlot>> = {};
  const positions: Partial<Record<SiMovableOverlayKind, SiOverlayPosition>> = {};

  for (const kind of movable) {
    const slot = pool.shift();
    if (!slot) break;
    assignments[kind] = slot;
    const { edgeMarginX, edgeMarginY } = randomMarginsForSlot(slot);
    const xy = resolveSiOverlaySlotPosition(slot, edgeMarginX, edgeMarginY);
    positions[kind] = { ...xy, slot, edgeMarginX, edgeMarginY };
  }

  return {
    assignments,
    positions,
    centerImageShift: resolveCenterImageShift(assignments),
  };
}

function resolveCenterImageShift(
  assignments: Partial<Record<SiMovableOverlayKind, SiOverlaySlot>>,
): SiCenterImageShift {
  const slots = Object.values(assignments).filter((slot): slot is SiOverlaySlot => Boolean(slot));
  if (slots.length < 1 || slots.length > 2) return 'none';

  const sides = new Set(slots.map(sideForSiOverlaySlot));
  if (sides.size !== 1) return 'none';

  const side = [...sides][0]!;
  return side === 'left' ? 'right' : 'left';
}
