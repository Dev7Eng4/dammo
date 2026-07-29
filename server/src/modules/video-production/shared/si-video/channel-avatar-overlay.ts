import { SI_FPS } from './si.constants.js';
import {
  CHANNEL_AVATAR_MARGIN_RIGHT_PX,
  CHANNEL_AVATAR_MARGIN_TOP_PX,
  CHANNEL_AVATAR_SIZE_PX,
} from './si.constants.js';

const AVATAR_SCALED_LABEL = 'channel_avatar_scaled';

/** Render circle at 4× then Lanczos-down for a sharp disk + clean AA edge. */
const AVATAR_SUPERSAMPLE = 4;
/** White ring thickness in final pixels (~YouTube-style). */
const AVATAR_BORDER_PX = 2;
/** Outer alpha feather in supersampled pixels (≈0.5px after downscale). */
const AVATAR_EDGE_FEATHER_HI = 2;

/**
 * Scale to fill, center-crop, circular mask with white ring + AA, then downscale.
 * Overlay top-right with fixed margins.
 */
export function appendChannelAvatarOverlayFilters(
  filterParts: string[],
  baseVideoLabel: string,
  avatarInputLabel: string,
  outputLabel: string,
): void {
  const size = CHANNEL_AVATAR_SIZE_PX;
  const hi = size * AVATAR_SUPERSAMPLE;
  const borderHi = AVATAR_BORDER_PX * AVATAR_SUPERSAMPLE;
  const feather = AVATAR_EDGE_FEATHER_HI;
  const d = 'hypot(X-W/2,Y-H/2)';
  const r = 'min(W,H)/2';

  // White ring in [R-border, R); soft alpha only on the outer rim.
  const geq =
    `format=rgba,geq=` +
    `r='if(gte(${d},${r}-${borderHi}),255,r(X,Y))':` +
    `g='if(gte(${d},${r}-${borderHi}),255,g(X,Y))':` +
    `b='if(gte(${d},${r}-${borderHi}),255,b(X,Y))':` +
    `a='if(gte(${d},${r}),0,if(lte(${d},${r}-${feather}),255,255*(${r}-${d})/${feather}))'`;

  filterParts.push(
    `[${avatarInputLabel}]fps=${SI_FPS},` +
      `scale=${hi}:${hi}:force_original_aspect_ratio=increase:flags=lanczos,` +
      `crop=${hi}:${hi},` +
      `${geq},` +
      `scale=${size}:${size}:flags=lanczos` +
      `[${AVATAR_SCALED_LABEL}]`,
  );
  filterParts.push(
    `[${baseVideoLabel}][${AVATAR_SCALED_LABEL}]overlay=W-w-${CHANNEL_AVATAR_MARGIN_RIGHT_PX}:${CHANNEL_AVATAR_MARGIN_TOP_PX}:shortest=1:format=auto[${outputLabel}]`,
  );
}
