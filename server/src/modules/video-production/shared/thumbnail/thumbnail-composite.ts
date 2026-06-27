import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildChromeBrowserOptions } from '../../../../infrastructure/chrome/browser-launch.config.js';
import type { ThumbnailHorizontalCopy } from './thumbnail.types.js';

const COMPOSITE_HTML_PATH = fileURLToPath(new URL('./thumbnail-horizontal-composite.html', import.meta.url));
const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
const RENDER_TIMEOUT_MS = 60_000;

export interface RenderThumbnailCompositeInput {
  backgroundImagePath: string;
  flowLayout: {
    thumbnail_copy: ThumbnailHorizontalCopy;
    color_strategy: Record<string, unknown>;
  };
  outPath: string;
}

function detectImageMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

async function buildCompositeHtml(backgroundImagePath: string, flowLayout: RenderThumbnailCompositeInput['flowLayout']): Promise<string> {
  const absBg = path.resolve(backgroundImagePath);
  try {
    await fs.access(absBg);
  } catch {
    throw new Error(`renderThumbnailHorizontalFlowCompositeToPath: không tìm thấy ảnh nền: ${absBg}`);
  }

  const buf = await fs.readFile(absBg);
  const mime = detectImageMimeType(absBg);
  const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;

  let html = await fs.readFile(COMPOSITE_HTML_PATH, 'utf8');
  const snippet = `<script>window.__BG_DATA_URL__=${JSON.stringify(dataUrl)};window.__FLOW_LAYOUT__=${JSON.stringify(flowLayout)};<\/script>\n`;
  return html.replace('<body>', `<body>\n${snippet}`);
}

export async function renderThumbnailHorizontalFlowCompositeToPath(input: RenderThumbnailCompositeInput): Promise<string> {
  const absOut = path.resolve(input.outPath);
  await fs.mkdir(path.dirname(absOut), { recursive: true });

  const html = await buildCompositeHtml(input.backgroundImagePath, input.flowLayout);
  const browser = await chromium.launch(buildChromeBrowserOptions(true));

  try {
    const page = await browser.newPage({ viewport: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT } });
    await page.setContent(html, { waitUntil: 'load' });

    await page.waitForFunction(
      () => (window as Window & { __THUMBNAIL_READY__?: boolean; __THUMBNAIL_ERROR__?: string }).__THUMBNAIL_READY__ === true
        || (window as Window & { __THUMBNAIL_READY__?: boolean; __THUMBNAIL_ERROR__?: string }).__THUMBNAIL_ERROR__,
      { timeout: RENDER_TIMEOUT_MS },
    );

    const err = await page.evaluate(() => (window as Window & { __THUMBNAIL_ERROR__?: string }).__THUMBNAIL_ERROR__);
    if (err) {
      throw new Error(String(err));
    }

    const canvas = page.locator('#thumbCanvas');
    await canvas.screenshot({ type: 'jpeg', quality: 92, path: absOut });

    console.log(`[thumbnail-composite] saved: ${absOut}`);
    return absOut;
  } finally {
    await browser.close();
  }
}
