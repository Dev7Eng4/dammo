import fs from 'node:fs/promises';
import path from 'node:path';
import type { Locator, Page, Request, Response } from 'playwright';
import { AppError } from '../../../shared/http/errors.js';
import { META_BASE_URL, META_UPLOAD_URL_PATTERN, ASSISTANT_MESSAGE_TIMEOUT_MS, META_CONFIG } from './meta.config.js';
import { downloadAndSaveMetaAsset, resolveMetaMediaSavePath } from './meta-media.js';
import { normalizeReferenceImagePaths } from '../core/reference-images.js';
import { assertMetaGeneratedImageUrl, resolveMetaImageSourceUrl } from './meta-image-url.js';
import { isMetaQuotaExhaustedError, isMetaQuotaExhaustedOnPage, metaQuotaExhaustedError } from './meta-quota.js';
import { classifyMetaSubmit, composerHoldsPrompt, composerMatchesPrompt } from './meta-submit.js';
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
  humanClearInput,
  humanMove,
  humanPasteIntoFocused,
  humanPressEnter,
  humanReadLatestResponse,
  humanScroll,
  humanWander,
  randomDelay,
  randomInt,
} from '../../../infrastructure/browser/human-interaction.js';

const PROVIDER = 'meta' as const;
/** Grace period to detect composer-stop-button after submit (fast generations may skip it). */
const COMPOSER_STOP_GRACE_MS = 2_000;
const ASSISTANT_IMAGE_POLL_MS = 15_000;
/** Settle time after the image first appears: Meta briefly shows the reference image before swapping in the result. */
const IMAGE_SETTLE_BEFORE_DOWNLOAD_MS = 1_000;
/** Re-check the page for the out-of-quota card at most this often while waiting for the image. */
const QUOTA_CHECK_INTERVAL_MS = 2_000;
/** Max wait for an element to be stable and not covered before a click gives up. */
const SAFE_CLICK_TIMEOUT_MS = 15_000;
/** Max wait for the composer to show the attached reference images. */
const ATTACH_PREVIEW_TIMEOUT_MS = 8_000;
/** Max wait for reference images to finish uploading. */
const UPLOAD_TIMEOUT_MS = 60_000;
/** No upload request seen for this long: assume Meta did not need one (selector/host drift must not block). */
const UPLOAD_START_GRACE_MS = 10_000;
/** Max wait for the composer to hold the prompt after inserting it. */
const INSERT_PROMPT_TIMEOUT_MS = 3_000;
/** Max wait for the send button to be enabled once the prompt is in. */
const SEND_READY_TIMEOUT_MS = 20_000;
/** Keep the latest message in view this often while polling for its image. */
const SCROLL_INTERVAL_MS = 3_000;
/** Max wait after submit for Meta to accept the prompt (stop button or a new message). */
const SUBMIT_CONFIRM_TIMEOUT_MS = 45_000;
/** Prompt still in the composer this long after a submit try: press the send button. */
const SUBMIT_RETRY_INTERVAL_MS = 4_000;
/** A message can show up just before the composer empties, so `hijacked` must last this long. */
const SUBMIT_HIJACK_SETTLE_MS = 4_000;

const stepStartByPage = new WeakMap<Page, number>();

function metaLog(page: Page, step: string, msg: string): void {
  const start = stepStartByPage.get(page);
  const elapsed = start ? `+${((Date.now() - start) / 1000).toFixed(1)}s` : '+0.0s';
  console.log(`[meta][${step}] ${elapsed} ${msg}`);
}

function errText(err: unknown): string {
  return err instanceof Error ? (err.message.split('\n')[0] ?? '') : String(err);
}

/** Composer text; undefined when it could not be read. */
async function composerText(page: Page): Promise<string | undefined> {
  return page
    .locator(META_CONFIG.selectors.promptInput)
    .last()
    .evaluate(
      el =>
        el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement ? el.value : (el.textContent ?? ''),
      undefined,
      { timeout: 2_000 },
    )
    .catch(() => undefined);
}

async function composerInputLength(page: Page): Promise<number> {
  return (await composerText(page))?.length ?? -1;
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

function promptNotSentError(detail: string): AppError {
  return new AppError(`Meta prompt was not sent: ${detail}`, 502, 'META_PROMPT_NOT_SENT');
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

/**
 * Move the mouse to the element, then click the element itself instead of the screen position: Playwright
 * waits until it stops moving and refuses when something else is on top, so a layout shift during the
 * mouse move never lands the click on a suggestion chip.
 */
async function safeClick(page: Page, locator: Locator): Promise<void> {
  await locator.waitFor({ state: 'visible', timeout: SAFE_CLICK_TIMEOUT_MS });
  const box = await locator.boundingBox();
  const position = box
    ? { x: box.width * (0.35 + Math.random() * 0.3), y: box.height * (0.35 + Math.random() * 0.3) }
    : undefined;
  if (box && position) await humanMove(page, box.x + position.x, box.y + position.y);
  await randomDelay(80, 220);
  await locator.click({
    delay: randomInt(40, 120),
    timeout: SAFE_CLICK_TIMEOUT_MS,
    ...(position ? { position } : {}),
  });
  await randomDelay(100, 280);
}

async function focusComposer(page: Page, input: Locator): Promise<void> {
  await safeClick(page, input);
  await randomDelay(120, 300);
  await input.focus();
}

async function isComposerFocused(input: Locator): Promise<boolean> {
  return input
    .evaluate(el => el.contains(document.activeElement), undefined, { timeout: 2_000 })
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

async function clickSendButton(page: Page): Promise<boolean> {
  if (!(await isSendButtonEnabled(page))) return false;
  try {
    const button = page.locator(META_CONFIG.selectors.composerSendButton).first();
    await button.click({ delay: randomInt(40, 120), timeout: 3_000 });
    return true;
  } catch (err) {
    metaLog(page, 'submit', `send button click failed: ${errText(err)}`);
    return false;
  }
}

async function submitComposer(page: Page, input: Locator, submitWith: 'enter' | 'button'): Promise<void> {
  if (submitWith === 'button') {
    if (await clickSendButton(page)) {
      metaLog(page, 'submit', 'clicked send button');
      return;
    }
    metaLog(page, 'submit', 'send button not clickable - falling back to Space + Enter');
  }

  // Space + Enter on anything but the composer would press whatever is focused (e.g. a suggestion chip).
  await input.focus();
  if (!(await isComposerFocused(input))) {
    throw promptNotSentError('composer lost focus before submit');
  }
  metaLog(page, 'submit', 'pressing Space + Enter on keyboard');
  await humanPressEnter(page);
}

/** Every prompt gets its own chat: follow-up suggestions and older images only exist in used chats. */
async function ensureFreshChat(page: Page): Promise<void> {
  const messages = await countMessageItems(page);
  let onHome = false;
  try {
    onHome = new URL(page.url()).pathname === '/';
  } catch {
    // Not a URL yet: load the home page below.
  }
  if (messages === 0 && onHome) return;

  metaLog(page, 'new-chat', `opening a new chat (messages=${messages} url=${page.url()})`);
  await page.goto(META_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await waitForFirstVisible(page, META_CONFIG.selectors.promptInput);
  await randomDelay(800, 1_500);

  const left = await countMessageItems(page);
  if (left > 0) {
    throw domTimeoutError(`New chat still shows ${left} message(s)`);
  }
}

/** Wait until Meta has really taken the prompt; presses the send button when Enter was ignored. */
async function confirmPromptSent(page: Page, inputLenBefore: number, baselineMessages: number): Promise<void> {
  const startedAt = Date.now();
  let lastTryAt = startedAt;
  let hijackedSince: number | undefined;

  while (Date.now() - startedAt < SUBMIT_CONFIRM_TIMEOUT_MS) {
    await closeDialogIfVisible(page);
    const inputLen = await composerInputLength(page);
    const state = classifyMetaSubmit({
      inputLenBefore,
      inputLen,
      baselineMessages,
      messages: await countMessageItems(page),
      generating: await isComposerStopVisible(page),
    });

    if (state === 'sent') {
      metaLog(page, 'submit', `prompt accepted after ${Date.now() - startedAt}ms`);
      return;
    }

    if (state === 'hijacked') {
      hijackedSince ??= Date.now();
      if (Date.now() - hijackedSince >= SUBMIT_HIJACK_SETTLE_MS) {
        await dumpMetaDiagnostics(page, 'submit-hijacked');
        throw promptNotSentError('Meta answered something else while the prompt is still in the composer');
      }
    } else {
      hijackedSince = undefined;
      if (composerHoldsPrompt(inputLen, inputLenBefore) && Date.now() - lastTryAt >= SUBMIT_RETRY_INTERVAL_MS) {
        lastTryAt = Date.now();
        const clicked = await clickSendButton(page);
        metaLog(
          page,
          'submit',
          `prompt still in composer - ${clicked ? 'clicked send button' : 'send button not ready'} - ${await composerSnapshot(page)}`,
        );
      }
    }

    await randomDelay(300, 600);
  }

  await dumpMetaDiagnostics(page, 'submit-timeout');
  throw promptNotSentError(
    `not accepted within ${Math.round(SUBMIT_CONFIRM_TIMEOUT_MS / 1000)}s - ${await composerSnapshot(page)}`,
  );
}

async function waitForComposerGenerationComplete(page: Page, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  let generationStarted = false;
  let pollCount = 0;
  let nextIdleAt = randomInt(3, 5);

  while (Date.now() - startedAt < timeoutMs) {
    pollCount += 1;
    if (pollCount >= nextIdleAt) {
      await humanIdleWhileWaiting(page);
      pollCount = 0;
      nextIdleAt = randomInt(3, 5);
    }

    if (await isComposerStopVisible(page)) {
      if (!generationStarted) metaLog(page, 'generating', `stop button seen after ${Date.now() - startedAt}ms`);
      generationStarted = true;
    } else if (
      (generationStarted || Date.now() - startedAt >= COMPOSER_STOP_GRACE_MS) &&
      (await isComposerSendVisible(page))
    ) {
      metaLog(
        page,
        'generating',
        `composer back to send state after ${Date.now() - startedAt}ms (stop button seen: ${generationStarted})`,
      );
      return;
    }

    await randomDelay(400, 800);
  }

  metaLog(page, 'generating', `TIMEOUT waiting for send state - ${await composerSnapshot(page)}`);
  throw domTimeoutError('Timed out waiting for composer button to return to send state');
}

async function scrollToLatestMessage(page: Page): Promise<void> {
  await page
    .locator(META_CONFIG.selectors.messageItem)
    .last()
    .evaluate(el => el.scrollIntoView({ block: 'end' }), undefined, { timeout: 1_000 })
    .catch(() => undefined);
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

  let lastQuotaCheckAt = 0;
  let lastScrollAt = 0;
  const pollPage = async (): Promise<void> => {
    if (Date.now() - lastScrollAt >= SCROLL_INTERVAL_MS) {
      lastScrollAt = Date.now();
      await scrollToLatestMessage(page);
    }
    if (Date.now() - lastQuotaCheckAt < QUOTA_CHECK_INTERVAL_MS) return;
    lastQuotaCheckAt = Date.now();
    if (!(await isMetaQuotaExhaustedOnPage(page))) return;
    metaLog(page, 'image', `QUOTA EXHAUSTED after ${Date.now() - startedAt}ms - not downloading`);
    throw metaQuotaExhaustedError();
  };

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

    // Out of quota, Meta echoes the reference image next to an upgrade card — never treat that as the result.
    await pollPage();

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
          onPoll: pollPage,
        });
        metaLog(
          page,
          'image',
          `resolved image src (candidates=${resolved.candidates.length}) after ${Date.now() - startedAt}ms: ${resolved.url.slice(0, 120)}`,
        );
        return { assistant, sourceUrl: resolved.url };
      } catch (err) {
        if (isMetaQuotaExhaustedError(err)) throw err;
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

interface MetaUploadTracker {
  /** Upload requests seen so far. */
  started(): number;
  /** Resolves once every reference is uploaded; throws when Meta did not take them in time. */
  wait(): Promise<void>;
  dispose(): void;
}

/** The composer shows local previews at once, so only the network tells when references are really uploaded. */
function trackUploads(page: Page, expected: number): MetaUploadTracker {
  const beganAt = Date.now();
  let started = 0;
  let finished = 0;
  const isUpload = (request: Request): boolean =>
    request.method() === 'POST' && META_UPLOAD_URL_PATTERN.test(request.url());
  const onRequest = (request: Request): void => {
    if (isUpload(request)) started += 1;
  };
  const onResponse = (response: Response): void => {
    if (!isUpload(response.request())) return;
    if (response.ok()) finished += 1;
    else metaLog(page, 'attach', `upload answered ${response.status()}`);
  };
  page.on('request', onRequest);
  page.on('response', onResponse);

  return {
    started: () => started,
    async wait(): Promise<void> {
      while (finished < expected) {
        const waitedMs = Date.now() - beganAt;
        if (started === 0 && waitedMs >= UPLOAD_START_GRACE_MS) {
          metaLog(page, 'attach', `no upload request seen in ${waitedMs}ms - continuing without waiting`);
          return;
        }
        if (waitedMs >= UPLOAD_TIMEOUT_MS) {
          throw promptNotSentError(`${finished}/${expected} reference image(s) uploaded in ${Math.round(waitedMs / 1000)}s`);
        }
        await randomDelay(100, 200);
      }
      metaLog(page, 'attach', `${finished} reference(s) uploaded after ${Date.now() - beganAt}ms`);
    },
    dispose(): void {
      page.off('request', onRequest);
      page.off('response', onResponse);
    },
  };
}

/** Attach through the + menu and the file dialog. */
async function attachViaMenu(page: Page, imagePaths: string[]): Promise<void> {
  let left = imagePaths;
  while (left.length > 0) {
    const attachButton = await waitForFirstVisible(page, META_CONFIG.selectors.composerAddAttachmentButton, 15_000);
    await safeClick(page, attachButton);
    await randomDelay(500, 1_000);
    const dropzone = await waitForFirstVisible(page, META_CONFIG.selectors.composerAttachmentDropzone, 10_000);
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: SAFE_CLICK_TIMEOUT_MS + 5_000 }),
      safeClick(page, dropzone),
    ]);
    const chosen = fileChooser.isMultiple() ? left : left.slice(0, 1);
    await fileChooser.setFiles(chosen);
    left = left.slice(chosen.length);
    metaLog(page, 'attach', `selected via + menu: ${chosen.map(file => path.basename(file)).join(', ')}`);
    await randomDelay(400, 900);
  }
}

async function attachReferences(page: Page, input: Locator, imagePaths: string[], uploads: MetaUploadTracker): Promise<void> {
  await Promise.all(imagePaths.map(imagePath => fs.access(imagePath)));

  const previewCount = (): Promise<number> => input.locator('img').count().catch(() => 0);
  const waitTaken = async (): Promise<boolean> => {
    const deadline = Date.now() + ATTACH_PREVIEW_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if ((await previewCount()) >= imagePaths.length || uploads.started() >= imagePaths.length) return true;
      await randomDelay(80, 150);
    }
    return false;
  };

  let taken = false;
  try {
    await attachViaMenu(page, imagePaths);
    taken = await waitTaken();
  } catch (err) {
    metaLog(page, 'attach', `+ menu failed: ${errText(err)}`);
  }

  // Nothing at all was taken, so trying another way cannot attach a file twice.
  if (!taken && (await previewCount()) === 0 && uploads.started() === 0) {
    metaLog(page, 'attach', '+ menu took nothing - falling back to the file input');
    await page.keyboard.press('Escape');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.waitFor({ state: 'attached', timeout: 10_000 });
    await fileInput.setInputFiles(imagePaths);
    taken = await waitTaken();
  }

  const previews = await previewCount();
  if (!taken || previews > imagePaths.length) {
    throw promptNotSentError(`composer shows ${previews} reference image(s), expected ${imagePaths.length}`);
  }
  metaLog(page, 'attach', `${imagePaths.length} reference(s) attached`);
}

async function clearComposer(page: Page, input: Locator): Promise<void> {
  await focusComposer(page, input);
  await humanClearInput(page);
  metaLog(page, 'clear', `composer cleared (Ctrl+A, Backspace) - ${await composerSnapshot(page)}`);
}

async function waitForPromptInComposer(page: Page, prompt: string): Promise<boolean> {
  const deadline = Date.now() + INSERT_PROMPT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const text = await composerText(page);
    if (text !== undefined && composerMatchesPrompt(text, prompt)) return true;
    await randomDelay(80, 150);
  }
  return false;
}

/** Paste with Ctrl+V; the clipboard is held until the composer shows this very prompt. */
async function insertPrompt(page: Page, input: Locator, prompt: string): Promise<void> {
  await focusComposer(page, input);
  // Behind the inline reference images, so the references stay in front of the text.
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');

  let pasted = false;
  try {
    await humanPasteIntoFocused(page, prompt, async () => {
      pasted = await waitForPromptInComposer(page, prompt);
    });
  } catch (err) {
    metaLog(page, 'paste', `clipboard paste failed: ${errText(err)}`);
  }
  if (pasted) return;

  // Clipboard not available on this page: type the text in (line breaks would cut it off).
  if (((await composerText(page)) ?? '').trim() === '') {
    metaLog(page, 'paste', 'Ctrl+V pasted nothing - inserting the text directly');
    await input.focus();
    await page.keyboard.insertText(prompt.replace(/\s+/g, ' ').trim());
    if (await waitForPromptInComposer(page, prompt)) return;
  }

  throw promptNotSentError(`composer does not hold the prompt - ${await composerSnapshot(page)}`);
}

async function waitForSendReady(page: Page): Promise<void> {
  const deadline = Date.now() + SEND_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isSendButtonEnabled(page)) return;
    await randomDelay(100, 200);
  }
  throw promptNotSentError(`send button not enabled - ${await composerSnapshot(page)}`);
}

async function closeDialogIfVisible(page: Page): Promise<void> {
  const dialog = page.locator(META_CONFIG.selectors.dialog).first();
  if (!(await dialog.isVisible().catch(() => false))) return;
  const closeButton = dialog.locator(META_CONFIG.selectors.dialogCloseButton).first();
  if (!(await closeButton.isVisible().catch(() => false))) return;
  metaLog(page, 'dialog', 'dialog visible after submit - closing it');
  await safeClick(page, closeButton).catch(err => metaLog(page, 'dialog', `close failed: ${errText(err)}`));
}

export function createMetaProviderHandler(): LlmBrowserProviderHandler {
  return {
    provider: PROVIDER,

    async open(page: Page): Promise<void> {
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
      await ensureFreshChat(page);
      metaLog(page, 'send', `initial state - ${await composerSnapshot(page)}`);

      // Clear composer BEFORE attaching reference images so Ctrl+A/Backspace
      // does not remove already-uploaded attachments.
      const input = await waitForFirstVisible(page, META_CONFIG.selectors.promptInput);
      const baseline = await countMessageItems(page);
      await clearComposer(page, input);

      const uploads = trackUploads(page, referencePaths.length);
      try {
        if (referencePaths.length > 0) {
          await attachReferences(page, input, referencePaths, uploads);
          await randomDelay(500, 1_000);
        }
        // References keep uploading while the prompt goes in.
        await insertPrompt(page, input, prompt);
        await randomDelay(1_000, 1_200);
        metaLog(page, 'paste', `prompt inserted - ${await composerSnapshot(page)}`);
        if (referencePaths.length > 0) await uploads.wait();
      } finally {
        uploads.dispose();
      }
      await waitForSendReady(page);
      await randomDelay(1_500, 3_000);

      const textBeforeSubmit = (await composerText(page)) ?? '';
      if (!composerMatchesPrompt(textBeforeSubmit, prompt)) {
        throw promptNotSentError(`composer holds other text before submit: "${textBeforeSubmit.slice(0, 60)}"`);
      }
      const messagesBeforeSubmit = await countMessageItems(page);
      if (messagesBeforeSubmit > baseline) {
        throw promptNotSentError(`chat already has ${messagesBeforeSubmit} message(s) before submit`);
      }
      const submitWith = options?.submitWith ?? 'button';
      metaLog(page, 'submit', `submitting via ${submitWith}, baseline messages=${baseline} - ${await composerSnapshot(page)}`);

      await submitComposer(page, input, submitWith);
      await confirmPromptSent(page, textBeforeSubmit.length, baseline);
      metaLog(page, 'send', `done - ${await composerSnapshot(page)}`);

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
        const found = await extractFirstAssistantImage(page, remainingMs, baselineBlockCount);
        assistant = found.assistant;
        sourceUrl = found.sourceUrl;

        // Wait for the generated image to finish loading, then re-read the URL instead of
        // downloading the first one seen (which can still be the reference image).
        metaLog(page, 'image', `waiting ${IMAGE_SETTLE_BEFORE_DOWNLOAD_MS}ms for image to settle`);
        await new Promise(resolve => setTimeout(resolve, IMAGE_SETTLE_BEFORE_DOWNLOAD_MS));
        const settled = await resolveMetaImageSourceUrl(assistant, ASSISTANT_IMAGE_POLL_MS, { pollDelayMs: 400 });
        if (settled.url !== sourceUrl) {
          metaLog(page, 'image', `image url changed after settle: ${settled.url.slice(0, 120)}`);
          sourceUrl = settled.url;
        }
        // The upgrade card can render a moment after the (reference) image shows up.
        if (await isMetaQuotaExhaustedOnPage(page)) {
          metaLog(page, 'image', 'QUOTA EXHAUSTED after settle - not downloading');
          throw metaQuotaExhaustedError();
        }
        // Only https://scontent.xx.fbcdn.net/ src values are generated images; anything else
        // (e.g. the echoed reference upload) is treated as a failure so the job is retried.
        try {
          assertMetaGeneratedImageUrl(sourceUrl);
        } catch (err) {
          metaLog(page, 'image', `INVALID image src - not downloading: ${sourceUrl.slice(0, 120)}`);
          throw err;
        }
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
          mediaAssets.push(await downloadAndSaveMetaAsset(page, sourceUrl, outputPath, 'image', metaOptions.aspectRatio ?? '16:9', metaOptions.skipResize));
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

      // The image is already secured; a hiccup while looking at it must not fail the job.
      await humanPauseAfterMediaReady(page, assistant).catch(err => metaLog(page, 'receive', `pause failed: ${errText(err)}`));

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
