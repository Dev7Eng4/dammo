import fs from 'node:fs/promises';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { AppError } from '../../../shared/http/errors.js';
import { DIALOG_APPEAR_TIMEOUT_MS, META_BASE_URL, ASSISTANT_MESSAGE_TIMEOUT_MS, META_CONFIG } from '../meta.config.js';
import { downloadAndSaveMetaAsset, resolveMetaMediaSavePath } from '../meta-media.js';
import { resolveMetaImageSourceUrl } from '../meta-image-url.js';
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
/** Max wait for reference uploads to finish (send button enabled) before submitting. */
const SEND_READY_TIMEOUT_MS = 60_000;
/** Max wait after submit for Meta to accept the prompt (stop button or a new message). */
const SUBMIT_CONFIRM_TIMEOUT_MS = 10_000;

/** Message-item count captured right before a prompt is submitted, per page. */
const messageBaselineByPage = new WeakMap<Page, number>();

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

async function countMessageItems(page: Page): Promise<number> {
  return page.locator(META_CONFIG.selectors.messageItem).count().catch(() => 0);
}

async function isSendButtonEnabled(page: Page): Promise<boolean> {
  const button = page.locator(META_CONFIG.selectors.composerSendButton).first();
  if (!(await button.isVisible().catch(() => false))) return false;
  if (!(await button.isEnabled().catch(() => false))) return false;
  const ariaDisabled = await button.getAttribute('aria-disabled').catch(() => null);
  return ariaDisabled !== 'true';
}

/** Wait until the send button is enabled (reference uploads done + prompt present). */
async function waitForSendReady(page: Page, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isSendButtonEnabled(page)) return true;
    await randomDelay(300, 600);
  }
  return false;
}

/** True once Meta accepted the prompt: generation started or a new message item appeared. */
async function waitForPromptSubmitted(page: Page, baseline: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isComposerStopVisible(page)) return true;
    if ((await countMessageItems(page)) > baseline) return true;
    await randomDelay(250, 500);
  }
  return false;
}

async function submitComposer(page: Page, submitWith: 'enter' | 'button'): Promise<void> {
  if (submitWith === 'enter') {
    await humanPressEnter(page);
    return;
  }

  for (const candidate of splitSelectors(META_CONFIG.selectors.generateButton)) {
    const button = page.locator(candidate).first();
    if (await button.isVisible().catch(() => false)) {
      await humanClick(page, button);
      return;
    }
  }
  await humanPressEnter(page);
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
  baseline: number,
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

    // Only look at messages created by this prompt — never reuse an older image in the chat.
    if ((await countMessageItems(page)) <= baseline) {
      await randomDelay(400, 800);
      continue;
    }

    const lastMessage = page.locator(META_CONFIG.selectors.messageItem).last();
    const assistant = lastMessage.locator(META_CONFIG.selectors.assistantMessage).first();

    if ((await assistant.count().catch(() => 0)) > 0) {
      try {
        await assistant.waitFor({ state: 'visible', timeout: 1_500 });
        const remainingMs = Math.max(1_000, deadline - Date.now());
        const resolved = await resolveMetaImageSourceUrl(assistant, remainingMs, {
          pollDelayMs: 400,
          blobGraceMs: ASSISTANT_IMAGE_POLL_MS,
        });
        console.log(
          `[meta] resolved image url (${resolved.kind}, candidates=${resolved.candidateCount}): ${resolved.url.slice(0, 120)}`,
        );
        return { assistant, sourceUrl: resolved.url };
      } catch {
        await humanReadLatestResponse(page, assistant).catch(() => undefined);
      }
    }

    await randomDelay(400, 800);
  }

  const messageCount = await countMessageItems(page);
  const lastMessage = page.locator(META_CONFIG.selectors.messageItem).last();
  const assistantCount = await lastMessage.locator(META_CONFIG.selectors.assistantMessage).count().catch(() => 0);
  const imgCount = await lastMessage.locator('img').count().catch(() => 0);
  throw domTimeoutError(
    `No image found in assistant-message of last message item ` +
      `(waited ${Math.round(timeoutMs / 1000)}s, messages=${messageCount}, baseline=${baseline}, ` +
      `assistantInLast=${assistantCount}, imgInLast=${imgCount})`,
  );
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

      // Pressing Enter while a reference image is still uploading is silently ignored by Meta,
      // which used to fall through to a timeout + retry (clear, re-attach, re-type...).
      if (!(await waitForSendReady(page, SEND_READY_TIMEOUT_MS))) {
        console.warn('[meta] send button not enabled before submit — trying anyway');
      }

      const baseline = await countMessageItems(page);
      const submitWith = options?.submitWith ?? 'button';
      await submitComposer(page, submitWith);
      await dismissDialogIfPresent(page);

      if (!(await waitForPromptSubmitted(page, baseline, SUBMIT_CONFIRM_TIMEOUT_MS))) {
        // Re-submit only while the prompt is still sitting in the composer (send enabled);
        // an empty composer means it was sent and the page is just slow to show it.
        if (await waitForSendReady(page, SEND_READY_TIMEOUT_MS)) {
          console.warn('[meta] prompt not accepted after first submit — submitting again');
          await submitComposer(page, 'button');
          await dismissDialogIfPresent(page);
          if (!(await waitForPromptSubmitted(page, baseline, SUBMIT_CONFIRM_TIMEOUT_MS))) {
            throw new AppError('Meta did not accept the prompt (composer not submitted)', 502, 'META_PROMPT_NOT_SUBMITTED');
          }
        }
      }

      messageBaselineByPage.set(page, baseline);
      await randomDelay(500, 1_000);
    },

    async receiveResponse(page: Page, options?: LlmReceiveResponseOptions): Promise<LlmBrowserResponse> {
      const startedAt = Date.now();
      const metaOptions = resolveMetaOptions(options);
      const timeoutMs = resolveAssistantWaitTimeoutMs(metaOptions);

      let assistant: Locator;
      let sourceUrl: string;

      try {
        await waitForComposerGenerationComplete(page, timeoutMs);
        // The composer often returns to "send" long before the image is rendered (the stop
        // button is not always shown for image generation), so keep polling for the image with
        // the rest of the overall budget — at least ASSISTANT_IMAGE_POLL_MS.
        const remainingMs = Math.max(ASSISTANT_IMAGE_POLL_MS, timeoutMs - (Date.now() - startedAt));
        const baseline = messageBaselineByPage.get(page) ?? 0;
        ({ assistant, sourceUrl } = await extractFirstAssistantImage(page, remainingMs, baseline));
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
