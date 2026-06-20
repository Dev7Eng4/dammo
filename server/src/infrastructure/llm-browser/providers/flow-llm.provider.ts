import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page, Locator } from 'playwright';
import { AppError } from '../../../shared/http/errors.js';
import { FLOW_CONFIG } from '../flow.config.js';
import type { LlmBrowserProviderHandler } from '../llm-browser.provider.js';
import type {
  LlmBrowserResponse,
  LlmMediaAsset,
  LlmReceiveResponseOptions,
  LlmSendPromptOptions,
  LlmSendPromptResult,
  LlmSetupConfig,
} from '../llm-browser.types.js';
import {
  humanClick,
  humanPaste,
  humanWander,
  randomDelay,
} from '../human-interaction.js';

const WARMUP_URL = 'https://www.google.com';
const PROVIDER = 'flow' as const;

function domTimeoutError(detail: string): AppError {
  return new AppError(`LLM DOM timeout (${PROVIDER}): ${detail}`, 502, 'LLM_DOM_TIMEOUT');
}

function splitSelectors(selector: string): string[] {
  return selector.split(',').map(part => part.trim()).filter(Boolean);
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

async function isAnyVisible(page: Page, selector: string): Promise<boolean> {
  for (const candidate of splitSelectors(selector)) {
    if (await page.locator(candidate).first().isVisible().catch(() => false)) {
      return true;
    }
  }
  return false;
}

async function countResultImages(page: Page): Promise<number> {
  let total = 0;
  for (const candidate of splitSelectors(FLOW_CONFIG.selectors.resultImages)) {
    total += await page.locator(candidate).count();
  }
  return total;
}

async function warmUpBeforeFlow(page: Page): Promise<void> {
  const currentUrl = page.url();
  if (!currentUrl.startsWith(WARMUP_URL)) {
    await page.goto(WARMUP_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  }
  await randomDelay(1_500, 3_000);
  await humanWander(page);
  await randomDelay(800, 1_500);
}

async function findLatestResultImage(page: Page, baselineCount: number): Promise<Locator | null> {
  for (const candidate of splitSelectors(FLOW_CONFIG.selectors.resultImages)) {
    const images = page.locator(candidate);
    const count = await images.count();
    if (count <= baselineCount) continue;
    return images.nth(count - 1);
  }
  return null;
}

async function saveImageBytes(outputPath: string, bytes: Buffer): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, bytes);
}

async function saveImageFromSrc(page: Page, src: string, outputPath: string): Promise<void> {
  if (src.startsWith('blob:') || src.startsWith('data:')) {
    const bytes = await page.evaluate(async (url: string) => {
      const response = await fetch(url);
      const buffer = await response.arrayBuffer();
      return Array.from(new Uint8Array(buffer));
    }, src);
    await saveImageBytes(outputPath, Buffer.from(bytes));
    return;
  }

  if (src.startsWith('http')) {
    const response = await page.request.get(src);
    if (!response.ok()) {
      throw new AppError(`Failed to download image (${response.status()})`, 502, 'FLOW_IMAGE_DOWNLOAD_FAILED');
    }
    await saveImageBytes(outputPath, await response.body());
    return;
  }

  throw new AppError(`Unsupported image src: ${src.slice(0, 32)}`, 502, 'FLOW_IMAGE_DOWNLOAD_FAILED');
}

async function tryDownloadViaButton(page: Page, outputPath: string): Promise<boolean> {
  for (const candidate of splitSelectors(FLOW_CONFIG.selectors.downloadButton)) {
    const button = page.locator(candidate).first();
    if (!(await button.isVisible().catch(() => false))) continue;

    try {
      const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
      await humanClick(page, button);
      const download = await downloadPromise;
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await download.saveAs(outputPath);
      return true;
    } catch {
      // Try next selector.
    }
  }
  return false;
}

async function captureGeneratedImage(
  page: Page,
  baselineCount: number,
  outputPath: string,
): Promise<LlmMediaAsset> {
  const image = await findLatestResultImage(page, baselineCount);
  if (!image) {
    throw domTimeoutError('No generated image found in DOM');
  }

  if (await tryDownloadViaButton(page, outputPath)) {
    return { kind: 'image', localPath: outputPath };
  }

  const src = await image.getAttribute('src');
  if (src) {
    await saveImageFromSrc(page, src, outputPath);
    return { kind: 'image', sourceUrl: src, localPath: outputPath };
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await image.screenshot({ path: outputPath });
  return { kind: 'image', localPath: outputPath };
}

async function captureDebugScreenshot(page: Page, debugPath?: string): Promise<void> {
  if (!debugPath) return;
  try {
    await fs.mkdir(path.dirname(debugPath), { recursive: true });
    await page.screenshot({ path: debugPath, fullPage: true });
  } catch (err) {
    console.warn('[flow] failed to save debug screenshot:', err instanceof Error ? err.message : err);
  }
}

export function createFlowProviderHandler(): LlmBrowserProviderHandler {
  return {
    provider: PROVIDER,

    async open(page: Page): Promise<void> {
      const onFlowSite = page.url().includes('labs.google') && page.url().includes('flow');
      if (onFlowSite) {
        try {
          await waitForFirstVisible(page, FLOW_CONFIG.selectors.promptInput, 5_000);
          await randomDelay(400, 900);
          return;
        } catch {
          // Reload flow UI.
        }
      }

      await warmUpBeforeFlow(page);
      await page.goto(FLOW_CONFIG.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await randomDelay(2_000, 4_000);
      await waitForFirstVisible(page, FLOW_CONFIG.selectors.promptInput, 45_000);
      await randomDelay(400, 900);
    },

    async setupConfig(page: Page, setup: LlmSetupConfig): Promise<void> {
      if (setup.mode && setup.mode !== 'image') return;

      for (const candidate of splitSelectors(FLOW_CONFIG.selectors.imageModeTab)) {
        const tab = page.locator(candidate).first();
        if (await tab.isVisible().catch(() => false)) {
          await humanClick(page, tab);
          await randomDelay(400, 800);
          break;
        }
      }

      if (setup.model) {
        const option = page.getByRole('button', { name: new RegExp(setup.model, 'i') }).first();
        if (await option.isVisible().catch(() => false)) {
          await humanClick(page, option);
          await randomDelay(400, 800);
        }
      }
    },

    async readConversationIfNeeded(_page: Page): Promise<void> {
      // Flow is stateless per generation; no conversation scroll needed.
    },

    async sendPrompt(page: Page, prompt: string, options?: LlmSendPromptOptions): Promise<LlmSendPromptResult> {
      const input = await waitForFirstVisible(page, FLOW_CONFIG.selectors.promptInput);
      await humanPaste(page, input, prompt, { pasteStrategy: options?.pasteStrategy ?? 'direct' });

      const baselineBlockCount = await countResultImages(page);
      const generateButton = await waitForFirstVisible(page, FLOW_CONFIG.selectors.generateButton, 15_000);
      await humanClick(page, generateButton);
      await randomDelay(500, 1_000);

      return { baselineBlockCount };
    },

    async receiveResponse(page: Page, options?: LlmReceiveResponseOptions): Promise<LlmBrowserResponse> {
      const startedAt = Date.now();
      const timeoutMs = options?.timeoutMs ?? FLOW_CONFIG.defaultTimeoutMs;
      const stableMs = options?.stableMs ?? 3_000;
      const deadline = startedAt + timeoutMs;
      const baselineBlockCount = options?.baselineBlockCount ?? 0;
      const outputPath = options?.outputPath;

      let sawGenerating = false;

      while (Date.now() < deadline) {
        const generating = await isAnyVisible(page, FLOW_CONFIG.selectors.generatingIndicator);
        if (generating) {
          sawGenerating = true;
        }

        const image = await findLatestResultImage(page, baselineBlockCount);
        if (image && (!generating || sawGenerating)) {
          await randomDelay(stableMs, stableMs + 500);
          const stillGenerating = await isAnyVisible(page, FLOW_CONFIG.selectors.generatingIndicator);
          if (!stillGenerating) {
            const mediaAssets: LlmMediaAsset[] = [];
            if (outputPath) {
              mediaAssets.push(await captureGeneratedImage(page, baselineBlockCount, outputPath));
            } else {
              const src = await image.getAttribute('src');
              mediaAssets.push({ kind: 'image', sourceUrl: src ?? undefined });
            }

            return {
              provider: PROVIDER,
              content: '',
              codeBlocks: [],
              elapsedMs: Date.now() - startedAt,
              mediaAssets,
            };
          }
        }

        await randomDelay(500, 1_000);
      }

      await captureDebugScreenshot(page, options?.debugScreenshotPath);
      throw domTimeoutError('Timed out waiting for Flow image generation');
    },
  };
}
