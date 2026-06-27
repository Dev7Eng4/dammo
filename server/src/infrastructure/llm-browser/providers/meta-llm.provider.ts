import fs from 'node:fs/promises';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { AppError } from '../../../shared/http/errors.js';
import { META_BASE_URL, META_CONFIG } from '../meta.config.js';
import { downloadAndSaveMetaAsset } from '../meta-media.js';
import type { LlmBrowserProviderHandler } from '../llm-browser.provider.js';
import type {
  LlmBrowserResponse,
  LlmMediaAsset,
  LlmReceiveResponseOptions,
  LlmSendPromptOptions,
  LlmSetupConfig,
  MetaReceiveResponseOptions,
} from '../llm-browser.types.js';
import {
  humanClick,
  humanPaste,
  humanPressEnter,
  humanWander,
  randomDelay,
} from '../human-interaction.js';

const WARMUP_URL = 'https://www.google.com';
const PROVIDER = 'meta' as const;

function domTimeoutError(detail: string): AppError {
  return new AppError(`LLM DOM timeout (${PROVIDER}): ${detail}`, 502, 'LLM_DOM_TIMEOUT');
}

function splitSelectors(selector: string): string[] {
  return selector
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
}

async function waitForFirstVisible(page: Page, selector: string, timeout = 45_000): Promise<Locator> {
  const selectors = splitSelectors(selector);
  const deadline = Date.now() + timeout;
  let lastError: unknown;

  while (Date.now() < deadline) {
    for (const candidate of selectors) {
      const locator = page.locator(candidate).last();
      try {
        await locator.waitFor({ state: 'visible', timeout: 1_500 });
        return locator;
      } catch (err) {
        lastError = err;
      }
    }
    await randomDelay(200, 400);
  }

  throw domTimeoutError(
    `No visible element for selectors: ${selectors.join(' | ')} (${lastError instanceof Error ? lastError.message : 'timeout'})`,
  );
}

async function warmUpBeforeMeta(page: Page): Promise<void> {
  const currentUrl = page.url();
  if (!currentUrl.startsWith(WARMUP_URL)) {
    await page.goto(WARMUP_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  }
  await randomDelay(1_500, 3_000);
  await humanWander(page);
  await randomDelay(800, 1_500);
}

async function captureDebugScreenshot(page: Page, debugPath?: string): Promise<void> {
  if (!debugPath) return;
  try {
    await fs.mkdir(path.dirname(debugPath), { recursive: true });
    await page.screenshot({ path: debugPath, fullPage: true });
  } catch (err) {
    console.warn('[meta] failed to save debug screenshot:', err instanceof Error ? err.message : err);
  }
}

async function isGenerating(page: Page): Promise<boolean> {
  const indicator = META_CONFIG.selectors.generatingIndicator;
  if (!indicator) return false;

  for (const candidate of splitSelectors(indicator)) {
    const locator = page.locator(candidate).first();
    if (await locator.isVisible().catch(() => false)) {
      return true;
    }
  }
  return false;
}

async function countMediaElements(page: Page, selector: string): Promise<number> {
  let count = 0;
  for (const candidate of splitSelectors(selector)) {
    count += await page.locator(candidate).count().catch(() => 0);
  }
  return count;
}

async function extractMediaSource(locator: Locator): Promise<string | null> {
  const tagName = await locator.evaluate(node => node.tagName.toLowerCase()).catch(() => '');

  if (tagName === 'video') {
    const src = await locator.getAttribute('src');
    if (src?.trim()) return src.trim();

    const source = locator.locator('source').first();
    const sourceSrc = await source.getAttribute('src').catch(() => null);
    if (sourceSrc?.trim()) return sourceSrc.trim();
    return null;
  }

  if (tagName === 'source') {
    const src = await locator.getAttribute('src');
    return src?.trim() || null;
  }

  const src = await locator.getAttribute('src');
  return src?.trim() || null;
}

async function findLatestMedia(
  page: Page,
  mediaKind: 'image' | 'video' | 'auto',
  baselineImages: number,
  baselineVideos: number,
): Promise<{ kind: 'image' | 'video'; sourceUrl: string } | null> {
  const kinds: Array<'image' | 'video'> =
    mediaKind === 'auto' ? ['video', 'image'] : [mediaKind];

  for (const kind of kinds) {
    const selector =
      kind === 'video' ? META_CONFIG.selectors.resultVideos : META_CONFIG.selectors.resultImages;
    const baseline = kind === 'video' ? baselineVideos : baselineImages;
    const locators = page.locator(splitSelectors(selector).join(', '));
    const count = await locators.count().catch(() => 0);
    if (count <= baseline) continue;

    const latest = locators.nth(count - 1);
    const sourceUrl = await extractMediaSource(latest);
    if (sourceUrl) return { kind, sourceUrl };
  }

  return null;
}

function resolveMetaOptions(options?: LlmReceiveResponseOptions): MetaReceiveResponseOptions {
  return (options ?? {}) as MetaReceiveResponseOptions;
}

export function createMetaProviderHandler(): LlmBrowserProviderHandler {
  return {
    provider: PROVIDER,

    async open(page: Page): Promise<void> {
      await warmUpBeforeMeta(page);
      await page.goto(META_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await randomDelay(2_000, 4_000);
      await waitForFirstVisible(page, META_CONFIG.selectors.promptInput);
    },

    async setupConfig(_page: Page, _setup: LlmSetupConfig): Promise<void> {
      // Meta AI has no model setup flow in this integration.
    },

    async readConversationIfNeeded(_page: Page): Promise<void> {
      // Meta media generation is stateless per prompt.
    },

    async sendPrompt(page: Page, prompt: string, options?: LlmSendPromptOptions): Promise<void> {
      const input = await waitForFirstVisible(page, META_CONFIG.selectors.promptInput);
      await humanPaste(page, input, prompt, { pasteStrategy: options?.pasteStrategy ?? 'insertText' });

      const submitWith = options?.submitWith ?? 'button';
      if (submitWith === 'enter') {
        await humanPressEnter(page);
      } else {
        const sendSelectors = splitSelectors(META_CONFIG.selectors.generateButton);
        let sent = false;

        for (const candidate of sendSelectors) {
          const button = page.locator(candidate).first();
          if (await button.isVisible().catch(() => false)) {
            await humanClick(page, button);
            sent = true;
            break;
          }
        }

        if (!sent) {
          await humanPressEnter(page);
        }
      }

      await randomDelay(500, 1_000);
    },

    async receiveResponse(page: Page, options?: LlmReceiveResponseOptions): Promise<LlmBrowserResponse> {
      const startedAt = Date.now();
      const metaOptions = resolveMetaOptions(options);
      const timeoutMs = metaOptions.timeoutMs ?? META_CONFIG.defaultTimeoutMs;
      const stableMs = metaOptions.stableMs ?? 2_000;
      const mediaKind = metaOptions.mediaKind ?? 'auto';
      const deadline = startedAt + timeoutMs;

      const baselineImages = await countMediaElements(page, META_CONFIG.selectors.resultImages);
      const baselineVideos = await countMediaElements(page, META_CONFIG.selectors.resultVideos);

      await randomDelay(1_500, 2_500);

      let lastMedia: { kind: 'image' | 'video'; sourceUrl: string } | null = null;
      let stableSince = 0;

      while (Date.now() < deadline) {
        const generating = await isGenerating(page);
        const found = await findLatestMedia(page, mediaKind, baselineImages, baselineVideos);

        if (found) {
          if (found.sourceUrl === lastMedia?.sourceUrl && !generating) {
            if (stableSince === 0) {
              stableSince = Date.now();
            } else if (Date.now() - stableSince >= stableMs) {
              lastMedia = found;
              break;
            }
          } else {
            lastMedia = found;
            stableSince = 0;
          }
        }

        await randomDelay(400, 800);
      }

      if (!lastMedia) {
        await captureDebugScreenshot(page, metaOptions.debugScreenshotPath);
        throw domTimeoutError(`Timed out waiting for Meta ${mediaKind} media`);
      }

      const mediaAssets: LlmMediaAsset[] = [];
      if (metaOptions.outputPath) {
        mediaAssets.push(
          await downloadAndSaveMetaAsset(page, lastMedia.sourceUrl, metaOptions.outputPath, lastMedia.kind),
        );
      } else {
        mediaAssets.push({ kind: lastMedia.kind, sourceUrl: lastMedia.sourceUrl });
      }

      return {
        provider: PROVIDER,
        content: '',
        codeBlocks: [],
        elapsedMs: Date.now() - startedAt,
        mediaAssets,
      };
    },
  };
}
