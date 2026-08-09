import {
  isHardwareEncoder,
  resolveFfmpegHwEncoder,
} from '../../../../infrastructure/ffmpeg/ffmpeg-encoder.js';
import {
  LOCAL_STOCK_ASSEMBLE_ZOOM_FACTOR,
  STOCK_CANVAS_H,
  STOCK_CANVAS_W,
  STOCK_FPS,
} from './stock-background.constants.js';
import {
  buildStockCropFilter,
  formatStockCropPanLog,
  randomStockCropPan,
} from './stock-prepare.js';

function stockNormalizeFilterInner(slowmoFactor: number, isFlip = false): string {
  const w = STOCK_CANVAS_W;
  const h = STOCK_CANVAS_H;
  const f = STOCK_FPS;
  const factor = slowmoFactor;
  const slowmo = factor !== 1.0 ? `,setpts=${factor.toFixed(4)}*PTS` : '';
  const flipFilter = isFlip ? ',hflip' : '';
  return `scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=fast_bilinear,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,format=yuv420p${flipFilter}${slowmo},fps=${f},setsar=1`;
}

export function localStockNormalizeFilterChain(
  inputLabel: string,
  outLabel: string,
  onLog?: (msg: string) => void,
): string {
  const hwEncoder = resolveFfmpegHwEncoder();
  const pixFmt = isHardwareEncoder(hwEncoder) ? 'nv12' : 'yuv420p';
  const cropW = Math.floor(STOCK_CANVAS_W / LOCAL_STOCK_ASSEMBLE_ZOOM_FACTOR / 2) * 2;
  const cropH = Math.floor(STOCK_CANVAS_H / LOCAL_STOCK_ASSEMBLE_ZOOM_FACTOR / 2) * 2;
  const pan = randomStockCropPan();
  onLog?.(`[reup-si] Local assemble ${formatStockCropPanLog(pan)}`);
  return (
    `[${inputLabel}]fps=${STOCK_FPS},` +
    `${buildStockCropFilter(cropW, cropH, pan)},` +
    `scale=${STOCK_CANVAS_W}:${STOCK_CANVAS_H},` +
    `setsar=1,format=${pixFmt}[${outLabel}]`
  );
}

export function stockNormalizeFilterChain(
  inputLabel: string,
  outLabel: string,
  slowmoFactor: number,
  isFlip = false,
): string {
  return `[${inputLabel}]${stockNormalizeFilterInner(slowmoFactor, isFlip)}[${outLabel}]`;
}
