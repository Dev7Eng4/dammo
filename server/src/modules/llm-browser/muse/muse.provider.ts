import fs from 'node:fs/promises';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { AppError } from '../../../shared/http/errors.js';
import { humanMove, randomDelay, randomInt } from '../../../infrastructure/browser/human-interaction.js';
import { normalizeReferenceImagePaths } from '../core/reference-images.js';
import type { LlmBrowserProviderHandler } from '../core/provider.interface.js';
import type {
  LlmBrowserResponse,
  LlmReceiveResponseOptions,
  LlmSendPromptOptions,
  LlmSendPromptResult,
  LlmSetupConfig,
} from '../core/types.js';
import {
  MUSE_CONFIRM_QUESTION_PATTERN,
  MUSE_CONFIRM_REPLY,
  MUSE_IMAGE_ERROR_PATTERN,
  MUSE_IMAGE_TIMEOUT_MS,
  MUSE_NEW_THREAD_URL,
  MUSE_SELECTORS as S,
  MUSE_SERVICE_DOWN_PATTERN,
  MUSE_VIDEO_TIMEOUT_MS,
} from './muse.config.js';
import { saveMuseImage, saveMuseVideo } from './muse-media.js';

type MuseMediaKind = 'image' | 'video';

const PROVIDER = 'muse' as const;
/** Max wait for the composer to appear after loading a thread. */
const COMPOSER_TIMEOUT_MS = 45_000;
/** Text typed before hydration is dropped; give the Send button this long to show before typing again. */
const SEND_BUTTON_WAIT_MS = 6_000;
const INSERT_ATTEMPTS = 4;
/** Max wait for the composer to show every attached reference image. */
const ATTACH_PREVIEW_TIMEOUT_MS = 15_000;
/** Max wait after clicking Send for Muse to take the message (Stop button, new user message or a thread URL). */
const SUBMIT_CONFIRM_TIMEOUT_MS = 30_000;
/** Muse is done (no Stop button) but no image yet: wait this long before reading its answer as a failure. */
const NO_IMAGE_GRACE_MS = 8_000;
/** Max wait for the lightbox to show the full-size image. */
const LIGHTBOX_TIMEOUT_MS = 30_000;
/** The lightbox image under this width is still the chat preview. */
const MIN_FULL_IMAGE_WIDTH = 800;
const POLL_MS = 500;
const STATE_LOG_INTERVAL_MS = 10_000;

const startedAtByPage = new WeakMap<Page, number>();

function museLog(page: Page, step: string, msg: string): void {
  const start = startedAtByPage.get(page);
  const elapsed = start ? `+${((Date.now() - start) / 1000).toFixed(1)}s` : '+0.0s';
  console.log(`[muse][${step}] ${elapsed} ${msg}`);
}

function errText(err: unknown): string {
  return err instanceof Error ? (err.message.split('\n')[0] ?? '') : String(err);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function museDomTimeoutError(detail: string): AppError {
  return new AppError(`LLM DOM timeout (${PROVIDER}): ${detail}`, 502, 'LLM_DOM_TIMEOUT');
}

export function musePromptNotSentError(detail: string): AppError {
  return new AppError(`Muse prompt was not sent: ${detail}`, 502, 'MUSE_PROMPT_NOT_SENT');
}

export function museMediaFailedError(kind: MuseMediaKind, detail: string): AppError {
  // Muse's own service is down (e.g. video 503): a new try right away will not help, so callers wait longer.
  if (MUSE_SERVICE_DOWN_PATTERN.test(detail)) {
    return new AppError(`Muse ${kind} service is unavailable: ${detail}`, 503, 'MUSE_SERVICE_UNAVAILABLE');
  }
  return new AppError(`Muse did not create the ${kind}: ${detail}`, 502, kind === 'video' ? 'MUSE_VIDEO_FAILED' : 'MUSE_IMAGE_FAILED');
}

async function isVisible(page: Page, selector: string): Promise<boolean> {
  return page
    .locator(selector)
    .first()
    .isVisible()
    .catch(() => false);
}

async function count(page: Page, selector: string): Promise<number> {
  return page
    .locator(selector)
    .count()
    .catch(() => 0);
}

async function composerValue(page: Page): Promise<string> {
  return page
    .locator(S.promptInput)
    .first()
    .inputValue({ timeout: 2_000 })
    .catch(() => '');
}

/** One-line page state for the log. */
async function snapshot(page: Page): Promise<string> {
  let urlPath = page.url();
  try {
    urlPath = new URL(page.url()).pathname;
  } catch {
    // keep the raw url
  }
  const input = (await composerValue(page)).length;
  const send = await isVisible(page, S.sendButton);
  const stop = await isVisible(page, S.stopButton);
  const users = await count(page, S.userMessage);
  const assistants = await count(page, S.assistantMessage);
  const images = await count(page, S.generatedImage);
  const videos = await count(page, S.generatedVideo);
  return `input=${input}ch send=${send} stop=${stop} user=${users} assistant=${assistants} images=${images} videos=${videos} path=${urlPath}`;
}

async function dumpDiagnostics(page: Page, reason: string, debugPath?: string): Promise<void> {
  museLog(page, 'diag', `reason=${reason} - ${await snapshot(page)}`);
  const lastAnswer = await lastAssistantText(page);
  if (lastAnswer) museLog(page, 'diag', `last answer: ${JSON.stringify(lastAnswer.slice(0, 400))}`);
  try {
    const file = debugPath ?? path.join(process.cwd(), 'data', 'muse-debug', `muse-${reason}-${Date.now()}.png`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, fullPage: true });
    museLog(page, 'diag', `screenshot -> ${file}`);
  } catch (err) {
    museLog(page, 'diag', `screenshot failed: ${errText(err)}`);
  }
}

/** Text of Muse's latest answer (all bubbles after the last user message). */
async function lastAssistantText(page: Page): Promise<string> {
  return page
    .evaluate(sel => {
      const items = Array.from(document.querySelectorAll<HTMLElement>(sel.messageItem));
      let lastUser = -1;
      items.forEach((item, index) => {
        if (item.dataset.messageRole === 'user') lastUser = index;
      });
      return items
        .slice(lastUser + 1)
        .filter(item => item.dataset.messageRole === 'assistant')
        .map(item => item.innerText.replace(/^Assistant message:\s*/i, '').trim())
        .join('\n')
        .trim();
    }, S)
    .catch(() => '');
}

async function safeClick(page: Page, locator: Locator): Promise<void> {
  await locator.waitFor({ state: 'visible', timeout: 15_000 });
  const box = await locator.boundingBox();
  if (box) {
    await humanMove(page, box.x + box.width * (0.35 + Math.random() * 0.3), box.y + box.height * (0.35 + Math.random() * 0.3));
  }
  await randomDelay(80, 220);
  await locator.click({ delay: randomInt(40, 120), timeout: 15_000 });
  await randomDelay(100, 280);
}

/** Load a new, empty side chat and wait for its composer. */
async function openNewThread(page: Page): Promise<void> {
  museLog(page, 'open', `loading ${MUSE_NEW_THREAD_URL}`);
  await page.goto(MUSE_NEW_THREAD_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  if (/\/login|accounts|facebook\.com/i.test(page.url())) {
    throw new AppError('Muse is not logged in on this Chrome profile', 401, 'MUSE_NOT_LOGGED_IN');
  }
  // Logged out, muse.ai redirects to its landing page with a sign-in form instead of the composer.
  const composer = page.locator(S.promptInput).first();
  const signIn = page.locator(S.signInForm).first();
  const deadline = Date.now() + COMPOSER_TIMEOUT_MS;
  for (;;) {
    if (await composer.isVisible().catch(() => false)) break;
    if (await signIn.isVisible().catch(() => false)) {
      await dumpDiagnostics(page, 'not-logged-in');
      throw new AppError('Muse is not logged in on this Chrome profile (muse.ai shows its sign-in form)', 401, 'MUSE_NOT_LOGGED_IN');
    }
    if (Date.now() >= deadline) {
      await dumpDiagnostics(page, 'no-composer');
      throw museDomTimeoutError(`composer not visible after ${COMPOSER_TIMEOUT_MS / 1000}s`);
    }
    await sleep(POLL_MS);
  }
  await randomDelay(1_500, 2_500);
  const messages = await count(page, S.messageItem);
  if (messages > 0) {
    throw museDomTimeoutError(`new thread already shows ${messages} message(s)`);
  }
}

/** Attach reference images through the composer's file input. */
async function attachReferences(page: Page, imagePaths: string[]): Promise<void> {
  await Promise.all(imagePaths.map(imagePath => fs.access(imagePath)));
  const before = await count(page, S.attachmentPreview);
  await page.locator(S.fileInput).first().setInputFiles(imagePaths);

  const deadline = Date.now() + ATTACH_PREVIEW_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if ((await count(page, S.attachmentPreview)) - before >= imagePaths.length) {
      museLog(page, 'attach', `${imagePaths.length} reference(s) attached: ${imagePaths.map(p => path.basename(p)).join(', ')}`);
      return;
    }
    await sleep(200);
  }
  throw musePromptNotSentError(
    `composer shows ${(await count(page, S.attachmentPreview)) - before}/${imagePaths.length} reference image(s)`,
  );
}

/**
 * Put the prompt in the composer until the Send button shows: text typed while the page is still
 * hydrating is dropped without a trace, so a missing Send button means "type it again".
 */
async function insertPrompt(page: Page, prompt: string): Promise<void> {
  const input = page.locator(S.promptInput).first();
  for (let attempt = 1; attempt <= INSERT_ATTEMPTS; attempt += 1) {
    await safeClick(page, input);
    await input.fill('');
    await input.fill(prompt);
    const deadline = Date.now() + SEND_BUTTON_WAIT_MS;
    while (Date.now() < deadline) {
      if ((await composerValue(page)) === prompt && (await isVisible(page, S.sendButton))) {
        museLog(page, 'prompt', `prompt in composer (${prompt.length}ch, try ${attempt})`);
        return;
      }
      await sleep(200);
    }
    museLog(page, 'prompt', `send button not shown after try ${attempt} - ${await snapshot(page)}`);
  }
  throw musePromptNotSentError(`composer did not take the prompt - ${await snapshot(page)}`);
}

/** Click Send and wait until Muse has taken the message. */
async function submit(page: Page, baselineUsers: number): Promise<void> {
  const send = page.locator(S.sendButton).first();
  await safeClick(page, send);

  const startedAt = Date.now();
  let retried = false;
  while (Date.now() - startedAt < SUBMIT_CONFIRM_TIMEOUT_MS) {
    const taken =
      (await isVisible(page, S.stopButton)) ||
      (await count(page, S.userMessage)) > baselineUsers ||
      (await composerValue(page)) === '';
    if (taken) {
      museLog(page, 'submit', `message taken after ${Date.now() - startedAt}ms`);
      return;
    }
    if (!retried && Date.now() - startedAt > 5_000 && (await isVisible(page, S.sendButton))) {
      retried = true;
      museLog(page, 'submit', 'still in composer - clicking Send again');
      await send.click({ timeout: 3_000 }).catch(() => undefined);
    }
    await sleep(POLL_MS);
  }
  await dumpDiagnostics(page, 'submit-timeout');
  throw musePromptNotSentError(`not taken within ${SUBMIT_CONFIRM_TIMEOUT_MS / 1000}s - ${await snapshot(page)}`);
}

async function sendMessage(page: Page, text: string, referencePaths: string[] = []): Promise<void> {
  const baselineUsers = await count(page, S.userMessage);
  if (referencePaths.length > 0) {
    await attachReferences(page, referencePaths);
    await randomDelay(400, 900);
  }
  await insertPrompt(page, text);
  await randomDelay(600, 1_400);
  await submit(page, baselineUsers);
}

function mediaSelector(kind: MuseMediaKind): string {
  return kind === 'video' ? S.generatedVideo : S.generatedImage;
}

/** The image has pixels, or the video knows its length (its blob is complete). */
async function isMediaLoaded(media: Locator, kind: MuseMediaKind): Promise<boolean> {
  if (kind === 'video') {
    return media
      .locator('video')
      .first()
      .evaluate(video => {
        const v = video as HTMLVideoElement;
        return Boolean(v.currentSrc || v.src) && v.readyState >= 1 && Number.isFinite(v.duration) && v.duration > 0;
      })
      .catch(() => false);
  }
  return media
    .locator('img')
    .first()
    .evaluate(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0)
    .catch(() => false);
}

/**
 * Wait for the new image or video. When Muse stops without one, its answer decides: a question gets one
 * "yes, go ahead"; anything else fails the job with Muse's own words.
 */
async function waitForGeneratedMedia(
  page: Page,
  kind: MuseMediaKind,
  baseline: number,
  deadline: number,
): Promise<Locator> {
  const selector = mediaSelector(kind);
  let idleSince: number | undefined;
  let confirmed = false;
  let lastStateLogAt = Date.now();

  while (Date.now() < deadline) {
    const found = await count(page, selector);
    const working = await isVisible(page, S.stopButton);

    if (found > baseline) {
      const media = page.locator(selector).nth(found - 1);
      if (await isMediaLoaded(media, kind)) {
        museLog(page, kind, `${kind} #${found} shown (still working: ${working})`);
        return media;
      }
    }

    if (working) {
      idleSince = undefined;
    } else {
      idleSince ??= Date.now();
      if (Date.now() - idleSince >= NO_IMAGE_GRACE_MS && (await count(page, S.assistantMessage)) > 0) {
        const answer = await lastAssistantText(page);
        if (!confirmed && MUSE_CONFIRM_QUESTION_PATTERN.test(answer) && !MUSE_IMAGE_ERROR_PATTERN.test(answer)) {
          confirmed = true;
          idleSince = undefined;
          museLog(page, kind, `Muse asked first - confirming: ${JSON.stringify(answer.slice(0, 160))}`);
          await sendMessage(page, MUSE_CONFIRM_REPLY.replace('image', kind));
          continue;
        }
        await dumpDiagnostics(page, `no-${kind}`);
        throw museMediaFailedError(kind, answer.slice(0, 300) || `Muse stopped without a ${kind} or an answer`);
      }
    }

    if (Date.now() - lastStateLogAt >= STATE_LOG_INTERVAL_MS) {
      lastStateLogAt = Date.now();
      museLog(page, kind, `waiting - ${await snapshot(page)}`);
    }
    await sleep(POLL_MS);
  }

  await dumpDiagnostics(page, `${kind}-timeout`);
  throw museDomTimeoutError(`no ${kind} within the time budget - ${await snapshot(page)}`);
}

/** Bytes of a blob: URL on the page, passed back as base64 (a few MB for a video). */
async function readBlob(page: Page, url: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const result = await page.evaluate(async blobUrl => {
    const response = await fetch(blobUrl);
    if (!response.ok) throw new Error(`fetch failed (${response.status})`);
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error('read failed'));
      reader.readAsDataURL(blob);
    });
    return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mimeType: blob.type };
  }, url);
  return { bytes: Buffer.from(result.base64, 'base64'), mimeType: result.mimeType };
}

/** The finished video's MP4: the chat's own `<video>` already holds the whole file. */
async function readVideo(page: Page, video: Locator): Promise<{ bytes: Buffer; mimeType: string; seconds: number }> {
  const info = await video
    .locator('video')
    .first()
    .evaluate(el => {
      const v = el as HTMLVideoElement;
      const wrapper = v.closest('[data-hatch-video-src]');
      return {
        src: wrapper?.getAttribute('data-hatch-video-src') || v.currentSrc || v.src,
        seconds: v.duration,
        width: v.videoWidth,
        height: v.videoHeight,
      };
    });
  museLog(page, 'download', `video ${info.width}x${info.height} ${info.seconds.toFixed(1)}s`);
  const { bytes, mimeType } = await readBlob(page, info.src);
  return { bytes, mimeType: mimeType || 'video/mp4', seconds: info.seconds };
}

/** Open the image in the lightbox and read the full-size file from its blob URL. */
async function readFullImage(page: Page, image: Locator, deadline: number): Promise<{ bytes: Buffer; mimeType: string }> {
  await image.scrollIntoViewIfNeeded().catch(() => undefined);
  await safeClick(page, image.locator(S.openImageButton).first());

  const lightbox = page.locator(S.lightbox).last();
  await lightbox.waitFor({ state: 'visible', timeout: LIGHTBOX_TIMEOUT_MS });

  const until = Math.min(deadline, Date.now() + LIGHTBOX_TIMEOUT_MS);
  let src: string | undefined;
  let width = 0;
  while (Date.now() < until) {
    const best = await lightbox
      .evaluate(dialog => {
        const imgs = Array.from(dialog.querySelectorAll('img')).filter(img => img.complete && img.naturalWidth > 0);
        imgs.sort((a, b) => b.naturalWidth - a.naturalWidth);
        const top = imgs[0];
        return top ? { src: top.currentSrc || top.src, width: top.naturalWidth, height: top.naturalHeight } : undefined;
      })
      .catch(() => undefined);
    if (best && best.width >= MIN_FULL_IMAGE_WIDTH) {
      src = best.src;
      width = best.width;
      museLog(page, 'download', `full image ${best.width}x${best.height}`);
      break;
    }
    await sleep(POLL_MS);
  }
  if (!src) {
    await dumpDiagnostics(page, 'no-full-image');
    throw museDomTimeoutError(`lightbox did not show a full-size image (best width ${width})`);
  }

  const result = await readBlob(page, src);

  await lightbox
    .locator(S.lightboxCloseButton)
    .first()
    .click({ timeout: 3_000 })
    .catch(() => page.keyboard.press('Escape'));

  return { bytes: result.bytes, mimeType: result.mimeType || 'image/webp' };
}

export function createMuseProviderHandler(): LlmBrowserProviderHandler {
  return {
    provider: PROVIDER,

    async open(page: Page): Promise<void> {
      await openNewThread(page);
    },

    async setupConfig(_page: Page, _setup: LlmSetupConfig): Promise<void> {
      // Muse has no mode or model to pick: it decides to make an image from the prompt.
    },

    async readConversationIfNeeded(_page: Page): Promise<void> {
      // Every prompt gets its own side chat.
    },

    async sendPrompt(page: Page, prompt: string, options?: LlmSendPromptOptions): Promise<LlmSendPromptResult> {
      startedAtByPage.set(page, Date.now());
      const referencePaths = normalizeReferenceImagePaths(options?.referenceImagePaths);
      museLog(page, 'send', `start: promptLength=${prompt.length} refs=${referencePaths.length}`);

      // A fresh side chat per job: Muse never mixes it up with an earlier picture or clip.
      await openNewThread(page);
      const baseline = (await count(page, S.generatedImage)) + (await count(page, S.generatedVideo));
      await sendMessage(page, prompt, referencePaths);
      museLog(page, 'send', `done - ${await snapshot(page)}`);
      return { baselineBlockCount: baseline };
    },

    async receiveResponse(page: Page, options?: LlmReceiveResponseOptions): Promise<LlmBrowserResponse> {
      const startedAt = Date.now();
      const kind: MuseMediaKind = options?.mediaKind === 'video' ? 'video' : 'image';
      const timeoutMs = options?.timeoutMs ?? (kind === 'video' ? MUSE_VIDEO_TIMEOUT_MS : MUSE_IMAGE_TIMEOUT_MS);
      const deadline = startedAt + timeoutMs;
      const baseline = options?.baselineBlockCount ?? 0;
      museLog(page, 'receive', `start: ${kind} timeout=${Math.round(timeoutMs / 1000)}s baseline=${baseline}`);

      let localPath: string;
      try {
        const media = await waitForGeneratedMedia(page, kind, baseline, deadline);
        const saveOptions = {
          outputPath: options?.outputPath,
          outputDir: options?.outputDir,
          fileName: options?.fileName,
          aspectRatio: options?.aspectRatio,
          skipResize: options?.skipResize,
        };
        if (kind === 'video') {
          const { bytes, seconds } = await readVideo(page, media);
          localPath = await saveMuseVideo(bytes, saveOptions);
          museLog(page, 'receive', `saved ${localPath} (${Math.round(bytes.length / 1024)}KB, ${seconds.toFixed(1)}s)`);
        } else {
          const { bytes, mimeType } = await readFullImage(page, media, deadline);
          localPath = await saveMuseImage(bytes, mimeType, saveOptions);
          museLog(page, 'receive', `saved ${localPath} (${Math.round(bytes.length / 1024)}KB ${mimeType})`);
        }
      } catch (err) {
        museLog(page, 'receive', `FAILED: ${errText(err)}`);
        if (options?.debugScreenshotPath) await dumpDiagnostics(page, 'receive-failed', options.debugScreenshotPath);
        throw err;
      }

      museLog(page, 'receive', `done in ${Date.now() - startedAt}ms`);
      return {
        provider: PROVIDER,
        content: '',
        codeBlocks: [],
        elapsedMs: Date.now() - startedAt,
        mediaAssets: [{ kind, sourceUrl: page.url(), localPath }],
      };
    },
  };
}
