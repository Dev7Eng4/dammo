import fs from 'node:fs/promises';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { AppError } from '../../../shared/http/errors.js';
import { DIALOG_APPEAR_TIMEOUT_MS, META_BASE_URL, ASSISTANT_MESSAGE_TIMEOUT_MS, META_CONFIG } from './meta.config.js';
import { downloadAndSaveMetaAsset, resolveMetaMediaSavePath } from './meta-media.js';
import { normalizeReferenceImagePaths } from '../core/reference-images.js';
import { resolveMetaImageSourceUrl } from './meta-image-url.js';
import type { LlmBrowserProviderHandler } from '../core/provider.interface.js';
import type {
  LlmBrowserResponse,
  LlmMediaAsset,
  LlmReceiveResponseOptions,
  LlmSendPromptOptions,
  LlmSendPromptResult,
  LlmSetupConfig,
  MetaReceiveResponseOptions,
} from '../core/types.js';
import {
  humanFocusAndClear,
  humanClick,
  humanPaste,
  humanPressEnter,
  humanReadLatestResponse,
  humanScroll,
  humanWander,
  randomDelay,
  randomInt,
} from '../../../infrastructure/browser/human-interaction.js';

const WARMUP_URL = 'https://www.google.com';
const PROVIDER = 'meta' as const;
/** Grace period to detect composer-stop-button after submit (fast generations may skip it). */
const COMPOSER_STOP_GRACE_MS = 5_000;
const ASSISTANT_IMAGE_POLL_MS = 15_000;
/** Max wait for reference uploads to finish (send button enabled) before submitting. */
const SEND_READY_TIMEOUT_MS = 60_000;
/** Fixed idle time after the prompt is accepted, before polling for the generated image. */
const POST_SUBMIT_WAIT_MS = 60_000;
/** Max wait after submit for Meta to accept the prompt (stop button or a new message). */
const SUBMIT_CONFIRM_TIMEOUT_MS = 10_000;

const stepStartByPage = new WeakMap<Page, number>();

function metaLog(page: Page, step: string, msg: string): void {
  const start = stepStartByPage.get(page);
  const elapsed = start ? `+${((Date.now() - start) / 1000).toFixed(1)}s` : '+0.0s';
  console.log(`[meta][${step}] ${elapsed} ${msg}`);
}

function errText(err: unknown): string {
  return err instanceof Error ? (err.message.split('\n')[0] ?? '') : String(err);
}

async function composerInputLength(page: Page): Promise<number> {
  return page
    .locator(META_CONFIG.selectors.promptInput)
    .last()
    .evaluate(el => {
      const t = el as HTMLElement;
      if (t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement) return t.value.length;
      return (t.textContent ?? '').length;
    })
    .catch(() => -1);
}

/** Dump DOM facts + screenshot so selector drift on meta.ai can be identified from the log. */
async function dumpMetaDiagnostics(page: Page, reason: string): Promise<void> {
  try {
    const info = await page.evaluate(() => {
      const testIds: Record<string, number> = {};
      for (const el of Array.from(document.querySelectorAll('[data-testid]'))) {
        const id = el.getAttribute('data-testid') ?? '';
        testIds[id] = (testIds[id] ?? 0) + 1;
      }
      const dataAttrs = new Set<string>();
      for (const el of Array.from(document.querySelectorAll('*'))) {
        for (const name of el.getAttributeNames()) {
          if (name.startsWith('data-') && name !== 'data-testid') dataAttrs.add(name);
        }
      }
      const imgs = Array.from(document.images).map(img => {
        const r = img.getBoundingClientRect();
        return `${Math.round(r.width)}x${Math.round(r.height)} ${(img.currentSrc || img.src).slice(0, 90)}`;
      });
      return {
        url: location.href,
        title: document.title,
        testIds,
        dataAttrs: Array.from(dataAttrs).slice(0, 40),
        imgs: imgs.slice(0, 15),
        bodyTail: (document.body.innerText ?? '').replace(/\s+/g, ' ').slice(-400),
      };
    });
    metaLog(page, 'diag', `reason=${reason}`);
    metaLog(page, 'diag', `url=${info.url} title=${JSON.stringify(info.title)}`);
    metaLog(page, 'diag', `data-testid=${JSON.stringify(info.testIds)}`);
    metaLog(page, 'diag', `other data-* attrs=${info.dataAttrs.join(',')}`);
    metaLog(page, 'diag', `images(${info.imgs.length})=${JSON.stringify(info.imgs)}`);
    metaLog(page, 'diag', `page text tail=${JSON.stringify(info.bodyTail)}`);
  } catch (err) {
    metaLog(page, 'diag', `dump failed: ${errText(err)}`);
  }

  try {
    const dir = path.join(process.cwd(), 'data', 'meta-debug');
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `meta-${reason}-${Date.now()}.png`);
    await page.screenshot({ path: file, fullPage: true });
    metaLog(page, 'diag', `screenshot -> ${file}`);
  } catch (err) {
    metaLog(page, 'diag', `screenshot failed: ${errText(err)}`);
  }
}

/** One-line composer/page state used to trace where a run goes wrong. */
async function composerSnapshot(page: Page): Promise<string> {
  const inputLen = await composerInputLength(page);
  let urlPath = '';
  try {
    urlPath = new URL(page.url()).pathname;
  } catch {
    urlPath = page.url();
  }
  const send = page.locator(META_CONFIG.selectors.composerSendButton).first();
  const sendVisible = await send.isVisible().catch(() => false);
  const sendEnabled = sendVisible ? await send.isEnabled().catch(() => false) : false;
  const stopVisible = await page
    .locator(META_CONFIG.selectors.composerStopButton)
    .first()
    .isVisible()
    .catch(() => false);
  const messages = await page
    .locator(META_CONFIG.selectors.messageItem)
    .count()
    .catch(() => -1);
  const dialog = await page
    .locator(META_CONFIG.selectors.dialog)
    .first()
    .isVisible()
    .catch(() => false);
  return `input=${inputLen}ch send=${sendVisible ? (sendEnabled ? 'enabled' : 'disabled') : 'hidden'} stop=${stopVisible ? 'visible' : 'hidden'} messages=${messages} dialog=${dialog ? 'open' : 'none'} path=${urlPath}`;
}

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
  return page
    .locator(META_CONFIG.selectors.composerStopButton)
    .first()
    .isVisible()
    .catch(() => false);
}

async function isComposerSendVisible(page: Page): Promise<boolean> {
  return page
    .locator(META_CONFIG.selectors.composerSendButton)
    .first()
    .isVisible()
    .catch(() => false);
}

async function countMessageItems(page: Page): Promise<number> {
  return page
    .locator(META_CONFIG.selectors.messageItem)
    .count()
    .catch(() => 0);
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
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let lastLogAt = startedAt;
  while (Date.now() < deadline) {
    if (await isSendButtonEnabled(page)) {
      metaLog(page, 'send-ready', `send button enabled after ${Date.now() - startedAt}ms`);
      return true;
    }
    if (Date.now() - lastLogAt >= 5_000) {
      lastLogAt = Date.now();
      metaLog(page, 'send-ready', `still waiting (${Math.round((lastLogAt - startedAt) / 1000)}s) - ${await composerSnapshot(page)}`);
    }
    await randomDelay(300, 600);
  }
  metaLog(page, 'send-ready', `TIMEOUT after ${timeoutMs}ms - ${await composerSnapshot(page)}`);
  return false;
}

async function submitComposer(page: Page, submitWith: 'enter' | 'button'): Promise<void> {
  if (submitWith === 'enter') {
    metaLog(page, 'submit', 'pressing Space + Enter on keyboard');
    await humanPressEnter(page);
    return;
  }

  for (const candidate of splitSelectors(META_CONFIG.selectors.generateButton)) {
    const button = page.locator(candidate).first();
    if (await button.isVisible().catch(() => false)) {
      metaLog(page, 'submit', `clicking send button: ${candidate}`);
      await humanClick(page, button);
      return;
    }
  }
  metaLog(page, 'submit', 'no send button visible - falling back to Space + Enter');
  await humanPressEnter(page);
}

async function waitForComposerGenerationComplete(page: Page, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let pollCount = 0;
  let nextIdleAt = randomInt(3, 5);

  const phaseADeadline = Math.min(Date.now() + COMPOSER_STOP_GRACE_MS, deadline);
  let generationStarted = false;

  const waitStartedAt = Date.now();
  while (Date.now() < phaseADeadline) {
    if (await isComposerStopVisible(page)) {
      generationStarted = true;
      break;
    }
    await randomDelay(200, 400);
  }
  metaLog(
    page,
    'generating',
    generationStarted
      ? `stop button seen after ${Date.now() - waitStartedAt}ms - generation started`
      : `stop button NOT seen within ${COMPOSER_STOP_GRACE_MS}ms grace`,
  );
  let lastStateLogAt = Date.now();

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
      metaLog(page, 'generating', `composer back to send state after ${Date.now() - waitStartedAt}ms - ${await composerSnapshot(page)}`);
      return;
    }

    if (!generationStarted && sendVisible && !stopVisible) {
      return;
    }

    await randomDelay(400, 800);
  }

  metaLog(page, 'generating', `TIMEOUT waiting for send state - ${await composerSnapshot(page)}`);
  throw domTimeoutError('Timed out waiting for composer button to return to send state');
}

async function extractFirstAssistantImage(
  page: Page,
  timeoutMs: number,
  baseline: number,
): Promise<{ assistant: Locator; sourceUrl: string }> {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let pollCount = 0;
  let nextIdleAt = randomInt(3, 5);
  let lastStateLogAt = 0;
  metaLog(page, 'image', `polling for image (budget ${Math.round(timeoutMs / 1000)}s, baseline messages=${baseline})`);

  while (Date.now() < deadline) {
    pollCount += 1;
    if (pollCount >= nextIdleAt) {
      await humanIdleWhileWaiting(page);
      pollCount = 0;
      nextIdleAt = randomInt(3, 5);
    }

    if (Date.now() - lastStateLogAt >= 5_000) {
      lastStateLogAt = Date.now();
      const last = page.locator(META_CONFIG.selectors.messageItem).last();
      const assistants = await last
        .locator(META_CONFIG.selectors.assistantMessage)
        .count()
        .catch(() => 0);
      const imgs = await last
        .locator('img')
        .count()
        .catch(() => 0);
      metaLog(
        page,
        'image',
        `waited ${Math.round((lastStateLogAt - startedAt) / 1000)}s - assistantInLast=${assistants} imgInLast=${imgs} - ${await composerSnapshot(page)}`,
      );
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
        });
        metaLog(
          page,
          'image',
          `resolved image url (${resolved.kind}, candidates=${resolved.candidateCount}) after ${Date.now() - startedAt}ms: ${resolved.url.slice(0, 120)}`,
        );
        return { assistant, sourceUrl: resolved.url };
      } catch (err) {
        metaLog(page, 'image', `assistant message found but image not ready: ${errText(err)}`);
        await humanReadLatestResponse(page, assistant).catch(() => undefined);
      }
    }

    await randomDelay(400, 800);
  }

  const messageCount = await countMessageItems(page);
  const lastMessage = page.locator(META_CONFIG.selectors.messageItem).last();
  const assistantCount = await lastMessage
    .locator(META_CONFIG.selectors.assistantMessage)
    .count()
    .catch(() => 0);
  const imgCount = await lastMessage
    .locator('img')
    .count()
    .catch(() => 0);
  metaLog(page, 'image', `TIMEOUT - ${await composerSnapshot(page)}`);
  await dumpMetaDiagnostics(page, 'image-timeout');
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
  metaLog(page, 'attach', `attaching ${path.basename(imagePath)}`);

  const attachButton = await waitForFirstVisible(page, META_CONFIG.selectors.composerAddAttachmentButton);
  await humanClick(page, attachButton);
  metaLog(page, 'attach', 'clicked add-attachment button');
  await randomDelay(500, 1_000);

  try {
    const dropzone = await waitForFirstVisible(page, META_CONFIG.selectors.composerAttachmentDropzone, 10_000);
    const [fileChooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10_000 }), humanClick(page, dropzone)]);
    await fileChooser.setFiles(imagePath);
    metaLog(page, 'attach', `selected via dropzone: ${path.basename(imagePath)}`);
    return;
  } catch (err) {
    metaLog(page, 'attach', `dropzone failed (${errText(err)}) - falling back to file input`);
  }

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.waitFor({ state: 'attached', timeout: 10_000 });
  await fileInput.setInputFiles(imagePath);
  metaLog(page, 'attach', `selected via file input: ${path.basename(imagePath)}`);
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
        metaLog(page, 'dialog', 'dialog visible after submit - closing it');
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

    async sendPrompt(page: Page, prompt: string, options?: LlmSendPromptOptions): Promise<LlmSendPromptResult> {
      stepStartByPage.set(page, Date.now());
      await humanIdleBrief(page);

      const referencePaths = normalizeReferenceImagePaths(options?.referenceImagePaths);
      metaLog(
        page,
        'send',
        `start: promptLength=${prompt.length} refs=${referencePaths.length} submitWith=${options?.submitWith ?? 'button'} ` +
          `url=${page.url()}`,
      );
      metaLog(page, 'send', `initial state - ${await composerSnapshot(page)}`);

      // Clear composer BEFORE attaching reference images so Ctrl+A/Backspace
      // does not remove already-uploaded attachments.
      const input = await waitForFirstVisible(page, META_CONFIG.selectors.promptInput);
      await humanFocusAndClear(page, input);
      metaLog(page, 'clear', `composer cleared (Ctrl+A, Backspace) - ${await composerSnapshot(page)}`);

      if (referencePaths.length > 0) {
        await attachMetaReferenceFiles(page, referencePaths);
        await randomDelay(500, 1_000);
        metaLog(page, 'attach', `all ${referencePaths.length} reference(s) attached - ${await composerSnapshot(page)}`);
      }

      await humanPaste(page, input, prompt);
      await randomDelay(1_000, 1_200);
      metaLog(page, 'paste', `prompt pasted - ${await composerSnapshot(page)}`);

      // Pressing Enter while a reference image is still uploading is silently ignored by Meta,
      // which used to fall through to a timeout + retry (clear, re-attach, re-type...).
      // if (!(await waitForSendReady(page, SEND_READY_TIMEOUT_MS))) {
      //   metaLog(page, 'send-ready', 'WARNING: send button not enabled before submit - trying anyway');
      // }

      const baseline = await countMessageItems(page);
      const inputLenBeforeSubmit = await composerInputLength(page);
      const submitWith = options?.submitWith ?? 'button';
      metaLog(page, 'submit', `submitting via ${submitWith}, baseline messages=${baseline} - ${await composerSnapshot(page)}`);
      await randomDelay(3_000, 1_500);

      await submitComposer(page, submitWith);
      metaLog(page, 'submit', `submitted - ${await composerSnapshot(page)}`);
      await dismissDialogIfPresent(page);

      await randomDelay(2_000, 1_000);
      metaLog(page, 'send', `done - ${await composerSnapshot(page)}`);

      // Give Meta time to generate before we start polling; do nothing on the page meanwhile.
      // metaLog(page, 'post-submit-wait', `idle ${POST_SUBMIT_WAIT_MS / 1000}s before waiting for the image`);
      // const waitStartedAt = Date.now();
      // while (Date.now() - waitStartedAt < POST_SUBMIT_WAIT_MS) {
      //   const left = POST_SUBMIT_WAIT_MS - (Date.now() - waitStartedAt);
      //   await new Promise(resolve => setTimeout(resolve, Math.min(10_000, left)));
      //   const remaining = Math.max(0, POST_SUBMIT_WAIT_MS - (Date.now() - waitStartedAt));
      //   metaLog(page, 'post-submit-wait', `${Math.round(remaining / 1000)}s left - ${await composerSnapshot(page)}`);
      // }
      // metaLog(page, 'post-submit-wait', 'done - start waiting for image');

      return { baselineBlockCount: baseline };
    },

    async receiveResponse(page: Page, options?: LlmReceiveResponseOptions): Promise<LlmBrowserResponse> {
      const startedAt = Date.now();
      const metaOptions = resolveMetaOptions(options);
      const timeoutMs = resolveAssistantWaitTimeoutMs(metaOptions);
      const { baselineBlockCount } = metaOptions;
      if (baselineBlockCount === undefined) {
        throw new AppError(
          'Meta receiveResponse requires baselineBlockCount from sendPrompt',
          500,
          'META_MISSING_BASELINE',
        );
      }
      metaLog(
        page,
        'receive',
        `start: timeout=${Math.round(timeoutMs / 1000)}s output=${metaOptions.outputPath ?? metaOptions.fileName ?? '(none)'}`,
      );

      let assistant: Locator;
      let sourceUrl: string;

      try {
        await waitForComposerGenerationComplete(page, timeoutMs);
        // The composer often returns to "send" long before the image is rendered (the stop
        // button is not always shown for image generation), so keep polling for the image with
        // the rest of the overall budget — at least ASSISTANT_IMAGE_POLL_MS.
        const remainingMs = Math.max(ASSISTANT_IMAGE_POLL_MS, timeoutMs - (Date.now() - startedAt));
        ({ assistant, sourceUrl } = await extractFirstAssistantImage(page, remainingMs, baselineBlockCount));
      } catch (err) {
        metaLog(page, 'receive', `FAILED before download: ${errText(err)}`);
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

        metaLog(page, 'download', `saving to ${outputPath}`);
        try {
          mediaAssets.push(await downloadAndSaveMetaAsset(page, sourceUrl, outputPath, 'image', metaOptions.aspectRatio ?? '16:9'));
          metaLog(page, 'download', 'saved');
        } catch (err) {
          metaLog(page, 'download', `FAILED: ${errText(err)}`);
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

      metaLog(page, 'receive', `done in ${Date.now() - startedAt}ms`);
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
