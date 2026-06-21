import fs from 'node:fs';
import path from 'node:path';
import { paths } from '../../config/paths.js';
import { AppError } from '../../shared/http/errors.js';

const NOISE_REL = path.join('noise', 'noise.mp4');
const FONT_REL = path.join('fonts', 'NotoSansJP-Black.ttf');

export interface SiRequiredAssets {
  noisePath: string;
  fontPath: string;
  fontDir: string;
}

export function assertRequiredSiAssets(): SiRequiredAssets {
  const missing: string[] = [];

  const noisePath = path.join(paths.reupSiAssetsDir, NOISE_REL);
  if (!fs.existsSync(noisePath)) {
    missing.push(NOISE_REL);
  }

  const fontPath = path.join(paths.reupSiAssetsDir, FONT_REL);
  if (!fs.existsSync(fontPath)) {
    missing.push(FONT_REL);
  }

  if (missing.length > 0) {
    throw new AppError(
      `Missing required SI video assets in ${paths.reupSiAssetsDir}: ${missing.join(', ')}`,
      500,
      'SI_ASSETS_MISSING',
    );
  }

  return {
    noisePath,
    fontPath,
    fontDir: path.dirname(fontPath),
  };
}
