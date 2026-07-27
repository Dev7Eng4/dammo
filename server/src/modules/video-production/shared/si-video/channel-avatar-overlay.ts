import { SI_FPS } from './si.constants.js';
import {
  CHANNEL_AVATAR_MARGIN_RIGHT_PX,
  CHANNEL_AVATAR_MARGIN_TOP_PX,
  CHANNEL_AVATAR_SIZE_PX,
} from './si.constants.js';

const AVATAR_SCALED_LABEL = 'channel_avatar_scaled';

/** Scale to fill 150×150 then center-crop; overlay top-right with fixed margins. */
export function appendChannelAvatarOverlayFilters(
  filterParts: string[],
  baseVideoLabel: string,
  avatarInputLabel: string,
  outputLabel: string,
): void {
  const size = CHANNEL_AVATAR_SIZE_PX;
  filterParts.push(
    `[${avatarInputLabel}]fps=${SI_FPS},scale=${size}:${size}:force_original_aspect_ratio=increase,crop=${size}:${size},format=rgba[${AVATAR_SCALED_LABEL}]`,
  );
  filterParts.push(
    `[${baseVideoLabel}][${AVATAR_SCALED_LABEL}]overlay=W-w-${CHANNEL_AVATAR_MARGIN_RIGHT_PX}:${CHANNEL_AVATAR_MARGIN_TOP_PX}:shortest=1[${outputLabel}]`,
  );
}
