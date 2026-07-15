import fs from 'node:fs';
import path from 'node:path';
import { paths } from '../../../../config/paths.js';
import { AppError } from '../../../../shared/http/errors.js';
import {
  type CaptionStyleKey,
  getCaptionStylePreset,
  resolveCaptionStyleKey,
} from './caption-styles.js';

const NOISE_REL = path.join('noise', 'noise.mp4');
const DEFAULT_FONT_REL = path.join('fonts', 'NotoSansJP-Black.ttf');

export interface SiRequiredAssets {
  noisePath: string;
  fontPath: string;
  fontDir: string;
}

export interface CaptionFontAssets {
  fontPath: string;
  fontDir: string;
}

export function resolveCaptionFont(captionStyleKey?: CaptionStyleKey | string | null): CaptionFontAssets {
  const preset = getCaptionStylePreset(captionStyleKey);
  const fontPath = path.join(paths.reupSiAssetsDir, preset.fontRelPath);

  if (!fs.existsSync(fontPath)) {
    throw new AppError(
      `Missing caption font for style "${preset.key}" in ${paths.reupSiAssetsDir}: ${preset.fontRelPath}`,
      500,
      'SI_ASSETS_MISSING',
    );
  }

  return {
    fontPath,
    fontDir: path.dirname(fontPath),
  };
}

export function assertRequiredSiAssets(captionStyleKey?: CaptionStyleKey | string | null): SiRequiredAssets {
  const missing: string[] = [];

  const noisePath = path.join(paths.reupSiAssetsDir, NOISE_REL);
  if (!fs.existsSync(noisePath)) {
    missing.push(NOISE_REL);
  }

  const styleKey = resolveCaptionStyleKey(captionStyleKey);
  const defaultFontPath = path.join(paths.reupSiAssetsDir, DEFAULT_FONT_REL);
  if (!fs.existsSync(defaultFontPath)) {
    missing.push(DEFAULT_FONT_REL);
  }

  if (missing.length > 0) {
    throw new AppError(
      `Missing required SI video assets in ${paths.reupSiAssetsDir}: ${missing.join(', ')}`,
      500,
      'SI_ASSETS_MISSING',
    );
  }

  const captionFont = resolveCaptionFont(styleKey);

  return {
    noisePath,
    fontPath: captionFont.fontPath,
    fontDir: captionFont.fontDir,
  };
}
