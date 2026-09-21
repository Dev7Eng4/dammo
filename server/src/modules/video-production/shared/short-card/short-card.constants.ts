/** Short-card canvas is 9:16 — independent of landscape CANVAS_W/H. */
export const SHORT_CARD_CANVAS_W = 1080;
export const SHORT_CARD_CANVAS_H = 1920;
export const SHORT_CARD_FPS = 30;

/** Horizontal inset for the three cards (px). */
export const SHORT_CARD_MARGIN_X = 48;

/** Vertical gaps between header / body / footer blocks (px). */
export const SHORT_CARD_GAP_Y = 28;

export const SHORT_CARD_HEADER_RADIUS = 20;
export const SHORT_CARD_FOOTER_RADIUS = 20;

export const SHORT_CARD_HEADER_BG = '#111111';
export const SHORT_CARD_BODY_BG = '#ffffff';
export const SHORT_CARD_FOOTER_BG = '#8B4513';
export const SHORT_CARD_HEADER_TEXT = '#ffffff';
export const SHORT_CARD_BODY_TEXT = '#111111';
export const SHORT_CARD_FOOTER_TEXT = '#ffffff';
export const SHORT_CARD_ENGAGEMENT_TEXT = '#536471';

export const SHORT_CARD_OVERLAY_BASENAME = 'short-card-overlay.png';
export const SHORT_CARD_OUTPUT_BASENAME = 'short-card';

/** Relative to server data assets (Noto Sans JP Black). */
export const SHORT_CARD_FONT_REL_PATH = 'fonts/NotoSansJP-Black.ttf';

export const SHORT_CARD_IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.bmp',
  '.gif',
]);

export const SHORT_CARD_VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mov',
  '.mkv',
  '.webm',
  '.m4v',
]);
