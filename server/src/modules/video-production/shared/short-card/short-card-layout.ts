import {
  SHORT_CARD_CANVAS_H,
  SHORT_CARD_CANVAS_W,
  SHORT_CARD_GAP_Y,
  SHORT_CARD_MARGIN_X,
} from './short-card.constants.js';

/**
 * Layout metrics for the 9:16 card stack.
 * Used by the HTML template CSS variables and documented for future non-HTML renderers.
 */
export interface ShortCardLayout {
  canvasW: number;
  canvasH: number;
  marginX: number;
  gapY: number;
  /** Approximate vertical stack: header ~12%, body flex, footer ~14%. */
  headerMaxHeightPx: number;
  footerMaxHeightPx: number;
  stackTopPx: number;
  stackBottomPx: number;
}

export function resolveShortCardLayout(): ShortCardLayout {
  return {
    canvasW: SHORT_CARD_CANVAS_W,
    canvasH: SHORT_CARD_CANVAS_H,
    marginX: SHORT_CARD_MARGIN_X,
    gapY: SHORT_CARD_GAP_Y,
    headerMaxHeightPx: Math.round(SHORT_CARD_CANVAS_H * 0.14),
    footerMaxHeightPx: Math.round(SHORT_CARD_CANVAS_H * 0.16),
    stackTopPx: Math.round(SHORT_CARD_CANVAS_H * 0.08),
    stackBottomPx: Math.round(SHORT_CARD_CANVAS_H * 0.06),
  };
}
