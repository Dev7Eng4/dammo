import fs from 'node:fs/promises';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { AppError } from '../../../shared/http/errors.js';
import { DIALOG_APPEAR_TIMEOUT_MS, META_BASE_URL, ASSISTANT_MESSAGE_TIMEOUT_MS, META_CONFIG } from '../meta.config.js';
import { downloadAndSaveMetaAsset, resolveMetaMediaSavePath } from '../meta-media.js';
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
  humanClearInput,
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
/** Grace period to detect composer-stop-button after submit (fast generations may skip it). */
const COMPOSER_STOP_GRACE_MS = 5_000;
const ASSISTANT_IMAGE_POLL_MS = 15_000;

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
  await randomDelay(900, 1_100);
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

async function isComposerStopVisible(page: Page): Promise<boolean> {
  return page.locator(META_CONFIG.selectors.composerStopButton).first().isVisible().catch(() => false);
}

async function isComposerSendVisible(page: Page): Promise<boolean> {
  return page.locator(META_CONFIG.selectors.composerSendButton).first().isVisible().catch(() => false);
}

async function waitForComposerGenerationComplete(page: Page, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let pollCount = 0;
  let nextIdleAt = randomInt(3, 5);

  const phaseADeadline = Math.min(Date.now() + COMPOSER_STOP_GRACE_MS, deadline);
  let generationStarted = false;

  while (Date.now() < phaseADeadline) {
    if (await isComposerStopVisible(page)) {
      generationStarted = true;
      break;
    }
    await randomDelay(200, 400);
  }

  while (Date.now() < deadline) {
    pollCount += 1;
    if (pollCount >= nextIdleAt) {
      await humanIdleWhileWaiting(page);
      pollCount = 0;
      nextIdleAt = randomInt(3, 5);
    }

    const sendVisible = await isComposerSendVisible(page);
    const stopVisible = await isComposerStopVisible(page);

    if (sendVisible && !stopVisible) {
      return;
    }

    if (!generationStarted && sendVisible && !stopVisible) {
      return;
    }

    await randomDelay(400, 800);
  }

  throw domTimeoutError('Timed out waiting for composer button to return to send state');
}

async function extractFirstAssistantImage(
  page: Page,
  timeoutMs: number,
): Promise<{ assistant: Locator; sourceUrl: string }> {
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
        const src = await assistant.locator('img').first().getAttribute('src');
        const trimmed = src?.trim();
        if (trimmed) {
          return { assistant, sourceUrl: trimmed };
        }
        await humanReadLatestResponse(page, assistant);
      } catch {
        // Keep polling until the first assistant image is available.
      }
    }

    await randomDelay(400, 800);
  }

  throw domTimeoutError('No image found in assistant-message of last message item');
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

async function attachMetaReferenceFile(page: Page, imagePath: string): Promise<void> {
  await fs.access(imagePath);

  const attachButton = await waitForFirstVisible(page, META_CONFIG.selectors.composerAddAttachmentButton);
  await humanClick(page, attachButton);
  await randomDelay(500, 1_000);

  try {
    const dropzone = await waitForFirstVisible(page, META_CONFIG.selectors.composerAttachmentDropzone, 10_000);
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 10_000 }),
      humanClick(page, dropzone),
    ]);
    await fileChooser.setFiles(imagePath);
    console.log(`[meta] selected reference image via dropzone: ${imagePath}`);
    return;
  } catch {
    // fallback below
  }

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.waitFor({ state: 'attached', timeout: 10_000 });
  await fileInput.setInputFiles(imagePath);
  console.log(`[meta] selected reference image via file input: ${imagePath}`);
}

async function attachMetaReferenceFiles(page: Page, imagePaths: string[]): Promise<void> {
  for (const imagePath of imagePaths) {
    await attachMetaReferenceFile(page, imagePath);
    await randomDelay(400, 900);
  }
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

      const referencePaths = [
        ...(options?.referenceImagePaths ?? []),
        ...(options?.referenceImagePath ? [options.referenceImagePath] : []),
      ];

      // Clear composer BEFORE attaching reference images so Ctrl+A/Backspace
      // does not remove already-uploaded attachments.
      const input = await waitForFirstVisible(page, META_CONFIG.selectors.promptInput);
      await humanClick(page, input);
      await randomDelay(150, 400);
      await input.focus();
      await humanClearInput(page);

      if (referencePaths.length > 0) {
        await attachMetaReferenceFiles(page, referencePaths);
        await randomDelay(500, 1_000);
      }

      await humanPaste(page, input, prompt, {
        pasteStrategy: options?.pasteStrategy ?? 'human',
        skipClear: true,
      });
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
      const imagePollTimeoutMs = Math.min(ASSISTANT_IMAGE_POLL_MS, timeoutMs);

      let assistant: Locator;
      let sourceUrl: string;

      try {
        await waitForComposerGenerationComplete(page, timeoutMs);
        ({ assistant, sourceUrl } = await extractFirstAssistantImage(page, imagePollTimeoutMs));
      } catch (err) {
        await captureDebugScreenshot(page, metaOptions.debugScreenshotPath);
        throw err;
      }

      const mediaAssets: LlmMediaAsset[] = [];

      if (hasOutputConfig(metaOptions)) {
        const outputPath = resolveMetaMediaSavePath('image', {
          outputPath: metaOptions.outputPath,
          outputDir: metaOptions.outputDir,
          fileName: metaOptions.fileName,
        });

        try {
          mediaAssets.push(
            await downloadAndSaveMetaAsset(
              page,
              sourceUrl,
              outputPath,
              'image',
              metaOptions.aspectRatio ?? '16:9',
            ),
          );
        } catch (err) {
          await captureDebugScreenshot(page, metaOptions.debugScreenshotPath);
          const message = err instanceof Error ? err.message : String(err);
          throw domTimeoutError(`Failed to download Meta image: ${message}`);
        }
      } else {
        mediaAssets.push({ kind: 'image', sourceUrl });
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
