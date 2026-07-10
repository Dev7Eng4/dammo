import fs from 'node:fs/promises';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { AppError } from '../../../shared/http/errors.js';
import { DIALOG_APPEAR_TIMEOUT_MS, META_BASE_URL, ASSISTANT_MESSAGE_TIMEOUT_MS, META_CONFIG } from '../meta.config.js';
import { downloadAndSaveMetaAsset, resolveMetaMediaIndexedSavePaths } from '../meta-media.js';
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
  humanReadLatestResponse,
  humanScroll,
  humanWander,
  randomDelay,
  randomInt,
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

async function humanIdleBrief(page: Page): Promise<void> {
  if (Math.random() < 0.4) {
    await humanWander(page);
  }
  await randomDelay(200, 600);
}

async function humanIdleWhileWaiting(page: Page): Promise<void> {
  await humanScroll(page, randomInt(80, 220));
  await randomDelay(400, 900);
}

async function humanPauseAfterMediaReady(page: Page, assistant: Locator): Promise<void> {
  await humanReadLatestResponse(page, assistant);
  await humanIdleBrief(page);
  await randomDelay(1_000, 2_500);
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

async function waitForAssistantMessageWithImages(
  page: Page,
  timeoutMs: number,
): Promise<{ assistant: Locator; imageSources: string[] }> {
  const deadline = Date.now() + timeoutMs;
  let pollCount = 0;
  let nextIdleAt = randomInt(3, 5);

  while (Date.now() < deadline) {
    pollCount += 1;
    if (pollCount >= nextIdleAt) {
      await humanIdleWhileWaiting(page);
      pollCount = 0;
      nextIdleAt = randomInt(3, 5);
    }

    const lastMessage = page.locator(META_CONFIG.selectors.messageItem).last();
    const assistant = lastMessage.locator(META_CONFIG.selectors.assistantMessage).first();

    if ((await assistant.count().catch(() => 0)) > 0) {
      try {
        await assistant.waitFor({ state: 'visible', timeout: 1_500 });
        const imageSources = await collectImageSources(assistant);
        if (imageSources.length > 0) {
          return { assistant, imageSources };
        }
        await humanReadLatestResponse(page, assistant);
      } catch {
        // Keep polling until assistant message is visible with images.
      }
    }

    await randomDelay(400, 800);
  }

  throw domTimeoutError('Timed out waiting for assistant-message with images in last message item');
}

async function collectImageSources(assistant: Locator): Promise<string[]> {
  const images = assistant.locator('img');
  const count = await images.count().catch(() => 0);
  const sources: string[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < count; index += 1) {
    const src = await images.nth(index).getAttribute('src');
    const trimmed = src?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    sources.push(trimmed);
  }

  return sources;
}

function hasOutputConfig(options: MetaReceiveResponseOptions): boolean {
  return Boolean(options.outputPath?.trim() || options.outputDir?.trim() || options.fileName?.trim());
}

function resolveAssistantWaitTimeoutMs(options: MetaReceiveResponseOptions): number {
  const requested = options.timeoutMs ?? ASSISTANT_MESSAGE_TIMEOUT_MS;
  return Math.min(requested, ASSISTANT_MESSAGE_TIMEOUT_MS);
}

function resolveMetaOptions(options?: LlmReceiveResponseOptions): MetaReceiveResponseOptions {
  return (options ?? {}) as MetaReceiveResponseOptions;
}

async function downloadMetaImagesBestEffort(
  page: Page,
  imageSources: string[],
  outputPaths: string[],
): Promise<LlmMediaAsset[]> {
  const mediaAssets: LlmMediaAsset[] = [];

  for (let index = 0; index < imageSources.length; index += 1) {
    const sourceUrl = imageSources[index];
    const outputPath = outputPaths[index];

    try {
      mediaAssets.push(await downloadAndSaveMetaAsset(page, sourceUrl, outputPath, 'image'));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[meta] skipped image download:', message, sourceUrl.slice(0, 80));
    }
  }

  return mediaAssets;
}

async function dismissDialogIfPresent(page: Page): Promise<void> {
  await randomDelay(300, 800);

  const deadline = Date.now() + DIALOG_APPEAR_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const dialog = page.locator(META_CONFIG.selectors.dialog).first();

    if (await dialog.isVisible().catch(() => false)) {
      const closeButton = dialog.locator(META_CONFIG.selectors.dialogCloseButton).first();

      if (await closeButton.isVisible().catch(() => false)) {
        await humanClick(page, closeButton);
        await randomDelay(300, 600);
        return;
      }
    }

    await randomDelay(200, 400);
  }
}

export function createMetaProviderHandler(): LlmBrowserProviderHandler {
  return {
    provider: PROVIDER,

    async open(page: Page): Promise<void> {
      await warmUpBeforeMeta(page);
      await page.goto(META_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await randomDelay(2_000, 4_000);
      await waitForFirstVisible(page, META_CONFIG.selectors.promptInput);
      await humanIdleBrief(page);
      await randomDelay(800, 1_500);
    },

    async setupConfig(_page: Page, _setup: LlmSetupConfig): Promise<void> {
      // TEMP: bỏ bước chọn Create image qua DOM — dùng prefix prompt thay thế
      // await humanIdleBrief(page);
      // const attachmentButton = await waitForFirstVisible(
      //   page,
      //   META_CONFIG.selectors.composerAddAttachmentButton,
      // );
      // await humanClick(page, attachmentButton);
      // await randomDelay(500, 1_200);
      //
      // const menuItem = await waitForFirstVisible(
      //   page,
      //   META_CONFIG.selectors.composerMenuItemCheckbox,
      //   10_000,
      // );
      // await humanClick(page, menuItem);
      // await randomDelay(400, 900);
    },

    async readConversationIfNeeded(_page: Page): Promise<void> {
      // Meta media generation is stateless per prompt.
    },

    async sendPrompt(page: Page, prompt: string, options?: LlmSendPromptOptions): Promise<void> {
      await humanIdleBrief(page);
      const input = await waitForFirstVisible(page, META_CONFIG.selectors.promptInput);
      await humanClick(page, input);
      await randomDelay(150, 400);
      await humanPaste(page, input, prompt, { pasteStrategy: options?.pasteStrategy ?? 'human' });
      await randomDelay(500, 1_200);

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

      await dismissDialogIfPresent(page);
      await randomDelay(500, 1_000);
    },

    async receiveResponse(page: Page, options?: LlmReceiveResponseOptions): Promise<LlmBrowserResponse> {
      const startedAt = Date.now();
      const metaOptions = resolveMetaOptions(options);
      const timeoutMs = resolveAssistantWaitTimeoutMs(metaOptions);

      let assistant: Locator;
      let imageSources: string[];
      try {
        ({ assistant, imageSources } = await waitForAssistantMessageWithImages(page, timeoutMs));
      } catch (err) {
        await captureDebugScreenshot(page, metaOptions.debugScreenshotPath);
        throw err;
      }

      const mediaAssets: LlmMediaAsset[] = [];

      if (hasOutputConfig(metaOptions)) {
        const outputPaths = resolveMetaMediaIndexedSavePaths(imageSources.length, 'image', {
          outputPath: metaOptions.outputPath,
          outputDir: metaOptions.outputDir,
          fileName: metaOptions.fileName,
        });
        const downloaded = await downloadMetaImagesBestEffort(page, imageSources, outputPaths);

        if (downloaded.length === 0) {
          await captureDebugScreenshot(page, metaOptions.debugScreenshotPath);
          throw domTimeoutError('Failed to download any Meta images');
        }

        mediaAssets.push(...downloaded);
      } else {
        for (const sourceUrl of imageSources) {
          mediaAssets.push({ kind: 'image', sourceUrl });
        }
      }

      if (mediaAssets.length > 0) {
        await humanPauseAfterMediaReady(page, assistant);
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
