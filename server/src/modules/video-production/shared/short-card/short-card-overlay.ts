import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { paths } from '../../../../config/paths.js';
import { buildChromeBrowserOptions } from '../../../../infrastructure/chrome/browser-launch.config.js';
import { AppError } from '../../../../shared/http/errors.js';
import {
  SHORT_CARD_BODY_BG,
  SHORT_CARD_BODY_TEXT,
  SHORT_CARD_CANVAS_H,
  SHORT_CARD_CANVAS_W,
  SHORT_CARD_ENGAGEMENT_TEXT,
  SHORT_CARD_FONT_REL_PATH,
  SHORT_CARD_FOOTER_BG,
  SHORT_CARD_FOOTER_RADIUS,
  SHORT_CARD_FOOTER_TEXT,
  SHORT_CARD_GAP_Y,
  SHORT_CARD_HEADER_BG,
  SHORT_CARD_HEADER_RADIUS,
  SHORT_CARD_HEADER_TEXT,
  SHORT_CARD_MARGIN_X,
} from './short-card.constants.js';
import { resolveShortCardLayout } from './short-card-layout.js';
import type { ShortCardContent } from './short-card.types.js';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(MODULE_DIR, 'templates', 'card.html');
const ASSETS_DIR = path.join(MODULE_DIR, 'assets');

function toFileUrl(filePath: string): string {
  return pathToFileURL(filePath).href;
}

async function readAssetDataUrl(fileName: string): Promise<string> {
  const filePath = path.join(ASSETS_DIR, fileName);
  const buf = await fs.readFile(filePath);
  const base64 = buf.toString('base64');
  const mime = fileName.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
  return `data:${mime};base64,${base64}`;
}

function resolveFontPath(): string {
  return path.join(paths.reupSiAssetsDir, SHORT_CARD_FONT_REL_PATH);
}

async function buildHtml(content: ShortCardContent): Promise<string> {
  const layout = resolveShortCardLayout();
  const fontPath = resolveFontPath();

  try {
    await fs.access(fontPath);
  } catch {
    throw new AppError(
      `Missing short-card font: ${fontPath}`,
      500,
      'SHORT_CARD_FONT_MISSING',
    );
  }

  let template = await fs.readFile(TEMPLATE_PATH, 'utf8');
  const hasEngagement = Boolean(content.engagement);

  const [iconLike, iconComment, iconRepost, iconShare] = await Promise.all([
    readAssetDataUrl('icon-like.svg'),
    readAssetDataUrl('icon-comment.svg'),
    readAssetDataUrl('icon-repost.svg'),
    readAssetDataUrl('icon-share.svg'),
  ]);

  const replacements: Record<string, string> = {
    __FONT_URL__: toFileUrl(fontPath),
    __CANVAS_W__: String(SHORT_CARD_CANVAS_W),
    __CANVAS_H__: String(SHORT_CARD_CANVAS_H),
    __STACK_TOP__: String(layout.stackTopPx),
    __STACK_BOTTOM__: String(layout.stackBottomPx),
    __MARGIN_X__: String(SHORT_CARD_MARGIN_X),
    __GAP_Y__: String(SHORT_CARD_GAP_Y),
    __HEADER_BG__: SHORT_CARD_HEADER_BG,
    __HEADER_TEXT__: SHORT_CARD_HEADER_TEXT,
    __HEADER_RADIUS__: String(SHORT_CARD_HEADER_RADIUS),
    __HEADER_MAX_H__: String(layout.headerMaxHeightPx),
    __BODY_BG__: SHORT_CARD_BODY_BG,
    __BODY_TEXT__: SHORT_CARD_BODY_TEXT,
    __ENGAGEMENT_TEXT__: SHORT_CARD_ENGAGEMENT_TEXT,
    __FOOTER_BG__: SHORT_CARD_FOOTER_BG,
    __FOOTER_TEXT__: SHORT_CARD_FOOTER_TEXT,
    __FOOTER_RADIUS__: String(SHORT_CARD_FOOTER_RADIUS),
    __FOOTER_MAX_H__: String(layout.footerMaxHeightPx),
    __ENGAGEMENT_CLASS__: hasEngagement ? '' : 'hidden',
    __ICON_LIKE__: iconLike,
    __ICON_COMMENT__: iconComment,
    __ICON_REPOST__: iconRepost,
    __ICON_SHARE__: iconShare,
    __CONTENT_JSON__: JSON.stringify(content),
  };

  for (const [token, value] of Object.entries(replacements)) {
    template = template.split(token).join(value);
  }

  return template;
}

/**
 * Render the short-card HTML layout to a transparent PNG matching the 9:16 canvas.
 */
export async function renderShortCardOverlayPng(
  content: ShortCardContent,
  outputPath: string,
  options?: { onLog?: (msg: string) => void },
): Promise<string> {
  const log = options?.onLog ?? (() => undefined);
  const html = await buildHtml(content);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  log('[short-card] Launching Chrome for overlay screenshot...');
  const browser = await chromium.launch(buildChromeBrowserOptions(true));

  try {
    const page = await browser.newPage({
      viewport: { width: SHORT_CARD_CANVAS_W, height: SHORT_CARD_CANVAS_H },
      deviceScaleFactor: 1,
    });

    await page.setContent(html, { waitUntil: 'networkidle' });
    // Ensure @font-face has painted at least once.
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await new Promise(resolve => setTimeout(resolve, 150));

    await page.screenshot({
      path: outputPath,
      type: 'png',
      omitBackground: true,
    });

    log(`[short-card] Overlay saved → ${outputPath}`);
    return outputPath;
  } finally {
    await browser.close();
  }
}
