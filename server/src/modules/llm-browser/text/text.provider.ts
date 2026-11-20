import fs from 'node:fs/promises';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { AppError } from '../../../shared/http/errors.js';
import { normalizeReferenceImagePaths } from '../core/reference-images.js';
import { getLlmProviderConfig } from './text.config.js';
import type { LlmBrowserProviderHandler } from '../core/provider.interface.js';
import type {
  FlowOpenOptions,
  LlmBrowserProvider,
  LlmBrowserResponse,
  LlmTextProvider,
  LlmProviderConfig,
  LlmReceiveResponseOptions,
  LlmSendPromptOptions,
  LlmSendPromptResult,
  LlmSetupConfig,
} from '../core/types.js';
import {
  humanClick,
  humanFocusAndClear,
  humanPaste,
  humanPressEnter,
  humanReadLatestResponse,
  humanScroll,
  humanWander,
  randomDelay,
  randomInt,
} from '../../../infrastructure/browser/human-interaction.js';

const WARMUP_URL = 'https://www.google.com';

async function isPromptInputVisible(page: Page, config: LlmProviderConfig): Promise<boolean> {
  const selectors = config.selectors.promptInput.split(',').map(part => part.trim());
  for (const candidate of selectors) {
    const locator = page.locator(candidate).last();
    if (await locator.isVisible().catch(() => false)) {
      return true;
    }
  }
  return false;
}

async function warmUpBeforeProvider(page: Page): Promise<void> {
  const currentUrl = page.url();
  if (!currentUrl.startsWith(WARMUP_URL)) {
    await page.goto(WARMUP_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  }
  await randomDelay(1_500, 3_000);
  await humanWander(page);
  await humanScroll(page, randomInt(80, 200));
  await randomDelay(800, 1_500);
}

function domTimeoutError(provider: LlmTextProvider, detail: string): AppError {
  return new AppError(`LLM DOM timeout (${provider}): ${detail}`, 502, 'LLM_DOM_TIMEOUT');
}

async function waitForFirstVisible(page: Page, provider: LlmTextProvider, selector: string, timeout = 30_000) {
  const selectors = selector.split(',').map(part => part.trim());
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
    provider,
    `No visible element for selectors: ${selectors.join(' | ')} (${lastError instanceof Error ? lastError.message : 'timeout'})`
  );
}

const ATTACHMENT_READY_TIMEOUT_MS = 60_000;
/** Without a matching send button, previews must stay visible this long before the upload counts as done. */
const ATTACHMENT_SETTLE_MS = 4_000;
/** How long to wait for a preview after pasting files before trying a drop instead. */
const PASTE_PREVIEW_WAIT_MS = 6_000;

function imageMimeType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    default:
      return 'image/jpeg';
  }
}

/**
 * Hand files to the prompt (for providers without a reachable file input) by a synthetic event:
 * `paste` (Gemini ignores synthetic drops but accepts pasted files) or `drop`.
 */
async function sendFilesToPrompt(input: Locator, imagePaths: string[], method: 'paste' | 'drop'): Promise<void> {
  const files = await Promise.all(
    imagePaths.map(async filePath => ({
      name: path.basename(filePath),
      mimeType: imageMimeType(filePath),
      base64: (await fs.readFile(filePath)).toString('base64'),
    })),
  );
  await input.evaluate(
    (target, { payload, how }) => {
      const dataTransfer = new DataTransfer();
      for (const file of payload) {
        const bytes = Uint8Array.from(atob(file.base64), char => char.charCodeAt(0));
        dataTransfer.items.add(new File([bytes], file.name, { type: file.mimeType }));
      }
      if (how === 'paste') {
        target.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dataTransfer }));
        return;
      }
      for (const type of ['dragenter', 'dragover', 'drop']) {
        target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }));
      }
    },
    { payload: files, how: method },
  );
}

/** Previews shown since `baseline` (or `expected` when the provider has no preview selector). */
async function countNewPreviews(page: Page, config: LlmProviderConfig, baseline: number, expected: number): Promise<number> {
  const selector = config.selectors.attachmentPreview;
  return selector ? (await page.locator(selector).count()) - baseline : expected;
}

/** Paste the files; when no preview appears shortly, fall back to a drop. */
async function pasteOrDropFilesOnPrompt(
  page: Page,
  config: LlmProviderConfig,
  input: Locator,
  imagePaths: string[],
  previewBaseline: number,
): Promise<void> {
  await sendFilesToPrompt(input, imagePaths, 'paste');
  const deadline = Date.now() + PASTE_PREVIEW_WAIT_MS;
  while (Date.now() < deadline) {
    if ((await countNewPreviews(page, config, previewBaseline, imagePaths.length)) > 0) return;
    await randomDelay(400, 700);
  }
  console.log('[llm-browser] no preview after paste, dropping the files instead');
  await sendFilesToPrompt(input, imagePaths, 'drop');
}

/** `null` when no send button matches (e.g. the UI is not in English and the aria-label differs). */
async function isSendButtonEnabled(page: Page, config: LlmProviderConfig): Promise<boolean | null> {
  for (const candidate of config.selectors.sendButton.split(',').map(part => part.trim())) {
    const button = page.locator(candidate).first();
    if (await button.isVisible().catch(() => false)) {
      return button.isEnabled().catch(() => false);
    }
  }
  return null;
}

/** Wait until the attachment previews are shown and the upload no longer blocks sending. */
async function waitForAttachmentsReady(
  page: Page,
  provider: LlmTextProvider,
  config: LlmProviderConfig,
  previewBaseline: number,
  expected: number,
): Promise<void> {
  const deadline = Date.now() + ATTACHMENT_READY_TIMEOUT_MS;
  const previewSelector = config.selectors.attachmentPreview;
  await randomDelay(1_500, 2_500);

  let previews = 0;
  let sendState: boolean | null = null;
  let previewsSince: number | null = null;
  while (Date.now() < deadline) {
    previews = previewSelector ? (await page.locator(previewSelector).count()) - previewBaseline : expected;
    const previewsShown = previews >= expected;
    sendState = await isSendButtonEnabled(page, config);
    if (previewsShown && sendState === true) return;
    // No send button matched: trust the previews once they have stayed up for a few seconds (upload settles).
    if (previewsShown && sendState === null) {
      previewsSince ??= Date.now();
      if (Date.now() - previewsSince >= ATTACHMENT_SETTLE_MS) return;
    } else {
      previewsSince = null;
    }
    await randomDelay(500, 900);
  }

  throw domTimeoutError(
    provider,
    `${expected} attachment(s) not ready within ${ATTACHMENT_READY_TIMEOUT_MS / 1000}s ` +
      `(previews ${previews}/${expected}, send button ${sendState === null ? 'not found' : sendState ? 'enabled' : 'disabled'})`,
  );
}

/** Attach local images to the chat composer (call after the prompt is pasted). */
async function attachImages(
  page: Page,
  provider: LlmTextProvider,
  config: LlmProviderConfig,
  input: Locator,
  imagePaths: string[],
): Promise<void> {
  for (const imagePath of imagePaths) {
    await fs.access(imagePath);
  }
  const previewBaseline = config.selectors.attachmentPreview
    ? await page.locator(config.selectors.attachmentPreview).count()
    : 0;

  const fileInput = config.selectors.fileInput ? page.locator(config.selectors.fileInput).first() : null;
  if (fileInput && (await fileInput.count()) > 0) {
    await fileInput.setInputFiles(imagePaths);
  } else {
    await pasteOrDropFilesOnPrompt(page, config, input, imagePaths, previewBaseline);
  }
  console.log(`[llm-browser] attached ${imagePaths.length} image(s) (${provider}), waiting for upload...`);
  await waitForAttachmentsReady(page, provider, config, previewBaseline, imagePaths.length);
}

async function isGenerating(page: Page, config: LlmProviderConfig): Promise<boolean> {
  const indicator = config.selectors.generatingIndicator;
  if (!indicator) return false;

  for (const candidate of indicator.split(',').map(part => part.trim())) {
    const locator = page.locator(candidate).first();
    if (await locator.isVisible().catch(() => false)) {
      return true;
    }
  }

  return false;
}

async function countResponseBlocks(page: Page, config: LlmProviderConfig): Promise<number> {
  return page.locator(config.selectors.responseBlocks).count();
}

async function readLatestResponseIfAny(page: Page, config: LlmProviderConfig): Promise<void> {
  const blocks = page.locator(config.selectors.responseBlocks);
  const count = await blocks.count();
  if (count === 0) return;
  await humanReadLatestResponse(page, blocks.nth(count - 1), config.selectors.conversationScrollContainer);
}

/** Attribute put on every reply already on the page before a prompt is sent (see `markSeenReplies`). */
const SEEN_REPLY_ATTR = 'data-dammo-seen';

/** Mark the replies currently on the page, so the next reply is the one without the mark. */
async function markSeenReplies(page: Page, config: LlmProviderConfig): Promise<void> {
  await page
    .locator(config.selectors.responseBlocks)
    .evaluateAll((els, attr) => els.forEach(el => el.setAttribute(attr, '1')), SEEN_REPLY_ATTR);
}

/**
 * The reply to the prompt just sent, or null while it hasn't appeared. With `markSeenReplies` it is the
 * last reply on the page when that one is unmarked (works when the site unloads older messages, and
 * ignores older ones it loads back in above); otherwise the block after the baseline.
 */
async function findNewReply(page: Page, config: LlmProviderConfig, baselineBlockCount: number): Promise<Locator | null> {
  const blocks = page.locator(config.selectors.responseBlocks);
  const count = await blocks.count();
  if (config.markSeenReplies) {
    if (count === 0) return null;
    const last = blocks.nth(count - 1);
    const seen = await last.getAttribute(SEEN_REPLY_ATTR).catch(() => '1');
    return seen === null ? last : null;
  }
  return count > baselineBlockCount ? blocks.nth(baselineBlockCount) : null;
}

const USAGE_LIMIT_CHECK_EVERY_MS = 5_000;

/**
 * Returns a check to call while no reply has appeared: every few seconds it looks for the provider's
 * "out of messages" text and throws `LLM_USAGE_LIMIT` with the line it found.
 */
function usageLimitWatcher(page: Page, provider: LlmTextProvider, config: LlmProviderConfig): () => Promise<void> {
  const pattern = config.usageLimitPattern;
  let lastCheck = 0;
  return async () => {
    if (!pattern || Date.now() - lastCheck < USAGE_LIMIT_CHECK_EVERY_MS) return;
    lastCheck = Date.now();
    const text = await page.evaluate(() => document.body.innerText).catch(() => '');
    const line = text.split('\n').find(item => pattern.test(item));
    if (line) {
      throw new AppError(
        `${provider} đã hết lượt nhắn trên tài khoản của profile này: "${line.trim().slice(0, 160)}"`,
        429,
        'LLM_USAGE_LIMIT',
      );
    }
  };
}

async function waitForNewResponse(
  page: Page,
  config: LlmProviderConfig,
  baselineBlockCount: number,
  deadline: number,
  checkUsageLimit: () => Promise<void>,
): Promise<void> {
  while (Date.now() < deadline) {
    const newReply = await findNewReply(page, config, baselineBlockCount);
    const generating = await isGenerating(page, config);
    if (newReply || generating) {
      return;
    }
    await checkUsageLimit();
    await randomDelay(300, 600);
  }
}

async function scrollConversationContainer(page: Page, config: LlmProviderConfig, deltaY = 0): Promise<void> {
  const selector = config.selectors.conversationScrollContainer;
  if (!selector) return;

  await page.evaluate(
    ({ sel, dy }) => {
      const parts = sel.split(',');
      for (const part of parts) {
        const candidate = part.trim();
        if (!candidate) continue;
        const container = document.querySelector(candidate);
        if (!container) continue;
        const overflowY = getComputedStyle(container).overflowY;
        if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
          if (dy) {
            container.scrollTop += dy;
          } else {
            container.scrollTop = container.scrollHeight;
          }
          return;
        }
      }
    },
    { sel: selector, dy: deltaY },
  );
}

async function waitUntilNotGenerating(page: Page, config: LlmProviderConfig, deadline: number): Promise<void> {
  while (Date.now() < deadline) {
    if (!(await isGenerating(page, config))) return;
    await scrollConversationContainer(page, config, randomInt(80, 200));
    await randomDelay(300, 600);
  }
}

/**
 * Text of a reply block: its `contentSelector` parts joined (or the whole block when none match),
 * leaving out `excludeSelector` elements. Excluded elements are hidden while reading so innerText
 * keeps the rendered line breaks. (No named functions in evaluate: tsx would add a `__name` helper.)
 */
async function readBlockText(
  block: Locator,
  contentSelector: string | undefined,
  excludeSelector: string | undefined,
): Promise<string> {
  const text = await block
    .evaluate(
      (root, { content, exclude }) => {
        const hidden = exclude ? [...root.querySelectorAll<HTMLElement>(exclude)] : [];
        const previous = hidden.map(el => el.style.display);
        hidden.forEach(el => {
          el.style.display = 'none';
        });
        try {
          const matches = content ? [...root.querySelectorAll<HTMLElement>(content)] : [];
          // Outermost matches only, so a selector list that also matches nested parts doesn't read text twice.
          const parts = matches
            .filter(el => !matches.some(other => other !== el && other.contains(el)))
            .map(el => el.innerText.trim())
            .filter(Boolean);
          return parts.length > 0 ? parts.join('\n\n') : (root as HTMLElement).innerText;
        } finally {
          hidden.forEach((el, i) => {
            el.style.display = previous[i] ?? '';
          });
        }
      },
      { content: contentSelector ?? '', exclude: excludeSelector ?? '' },
    )
    .catch(() => block.innerText().catch(() => ''));
  return (text ?? '').trim();
}

/** Read `reply` (the new reply), or the latest reply on the page when it is not given. */
async function extractResponse(
  page: Page,
  config: LlmProviderConfig,
  reply?: Locator | null,
): Promise<{ content: string; codeBlocks: string[] }> {
  let target = reply ?? null;
  if (!target) {
    const blocks = page.locator(config.selectors.responseBlocks);
    const count = await blocks.count();
    if (count === 0) {
      return { content: '', codeBlocks: [] };
    }
    target = blocks.nth(count - 1);
  }

  const content = await readBlockText(
    target,
    config.selectors.responseContent,
    config.selectors.responseContentExclude,
  );

  const codeBlocks: string[] = [];
  if (config.selectors.responseCodeBlocks) {
    const codes = target.locator(config.selectors.responseCodeBlocks);
    const codeCount = await codes.count();
    for (let i = 0; i < codeCount; i += 1) {
      const text = (
        (await codes
          .nth(i)
          .innerText()
          .catch(() => '')) ?? ''
      ).trim();
      if (text) codeBlocks.push(text);
    }
  }

  return { content, codeBlocks };
}

export function createLlmProviderHandler(provider: LlmTextProvider): LlmBrowserProviderHandler {
  const config = getLlmProviderConfig(provider);

  return {
    provider,

    async open(page: Page, _options?: FlowOpenOptions): Promise<void> {
      const onProviderSite = page.url().startsWith(config.url);
      if (onProviderSite && (await isPromptInputVisible(page, config))) {
        await randomDelay(400, 900);
        return;
      }

      if (!onProviderSite) {
        await warmUpBeforeProvider(page);
        await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await randomDelay(2_000, 4_000);
      }

      await waitForFirstVisible(page, provider, config.selectors.promptInput, 45_000);
      await randomDelay(400, 900);
    },

    async setupConfig(page: Page, setup: LlmSetupConfig): Promise<void> {
      if (!setup.mode && !setup.model) return;

      const setupSelectors = config.setup;
      if (!setupSelectors?.modeButton && !setupSelectors?.modelButton) {
        return;
      }

      const buttonSelector = setupSelectors.modeButton ?? setupSelectors.modelButton;
      if (!buttonSelector) return;

      try {
        const button = page.locator(buttonSelector).first();
        if (await button.isVisible().catch(() => false)) {
          await humanClick(page, button);
          await randomDelay(300, 700);

          const label = setup.model ?? setup.mode;
          if (label) {
            const option = page.getByRole('menuitem', { name: new RegExp(label, 'i') }).first();
            if (await option.isVisible().catch(() => false)) {
              await humanClick(page, option);
              await randomDelay(400, 800);
            }
          }
        }
      } catch {
        // Setup is best-effort; UI varies frequently between providers.
      }
    },

    async readConversationIfNeeded(page: Page): Promise<void> {
      const count = await countResponseBlocks(page, config);
      if (count === 0) return;
      console.log(`[llm-browser] reading response before next prompt (${provider})`);
      await readLatestResponseIfAny(page, config);
    },

    async sendPrompt(page: Page, prompt: string, options?: LlmSendPromptOptions): Promise<LlmSendPromptResult> {
      const input = await waitForFirstVisible(page, provider, config.selectors.promptInput);
      await humanFocusAndClear(page, input);
      await humanPaste(page, input, prompt);

      const imagePaths = normalizeReferenceImagePaths(options?.referenceImagePaths);
      if (imagePaths.length > 0) {
        await attachImages(page, provider, config, input, imagePaths);
      }

      const baselineBlockCount = await countResponseBlocks(page, config);
      if (config.markSeenReplies) await markSeenReplies(page, config);

      const submitWith = options?.submitWith ?? 'button';

      if (submitWith === 'enter') {
        await humanPressEnter(page);
      } else {
        const sendSelectors = config.selectors.sendButton.split(',').map(part => part.trim());
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
      return { baselineBlockCount };
    },

    async receiveResponse(page: Page, options?: LlmReceiveResponseOptions): Promise<LlmBrowserResponse> {
      const startedAt = Date.now();
      const timeoutMs = options?.timeoutMs ?? 180_000;
      const stableMs = options?.stableMs ?? 2_000;
      const deadline = startedAt + timeoutMs;

      const providedBaseline = options?.baselineBlockCount;
      const baselineBlockCount = providedBaseline ?? (await countResponseBlocks(page, config));
      // Chỉ tin baseline đến từ sendPrompt; baseline tự suy đoán không phân biệt được block cũ/mới.
      const enforceNewBlock = providedBaseline != null;
      const newReply = () => (enforceNewBlock ? findNewReply(page, config, baselineBlockCount) : Promise.resolve(null));

      await randomDelay(1_500, 1_500);
      await scrollConversationContainer(page, config, randomInt(80, 200));

      const checkUsageLimit = usageLimitWatcher(page, provider, config);
      await waitForNewResponse(page, config, baselineBlockCount, deadline, checkUsageLimit);

      let lastContent = '';
      let stableSince = 0;

      while (Date.now() < deadline) {
        const reply = await newReply();
        if (enforceNewBlock && !reply) {
          await checkUsageLimit();
          await randomDelay(300, 600);
          continue;
        }

        const generating = await isGenerating(page, config);
        const { content, codeBlocks } = await extractResponse(page, config, reply);

        if (generating) {
          await scrollConversationContainer(page, config, randomInt(80, 200));
        }

        if (content && content === lastContent && !generating) {
          if (stableSince === 0) {
            stableSince = Date.now();
          } else if (Date.now() - stableSince >= stableMs) {
            await waitUntilNotGenerating(page, config, deadline);
            await randomDelay(400, 800);
            await readLatestResponseIfAny(page, config);
            return {
              provider,
              content,
              codeBlocks,
              elapsedMs: Date.now() - startedAt,
            };
          }
        } else {
          lastContent = content;
          stableSince = 0;
        }

        await randomDelay(300, 600);
      }

      await waitUntilNotGenerating(page, config, deadline);

      const finalReply = await newReply();
      if (enforceNewBlock && !finalReply) {
        const finalBlockCount = await countResponseBlocks(page, config);
        throw domTimeoutError(
          provider,
          `No new response block (baseline=${baselineBlockCount}, current=${finalBlockCount}) - stale response guard`,
        );
      }

      const { content, codeBlocks } = await extractResponse(page, config, finalReply);
      if (content) {
        await randomDelay(400, 800);
        await readLatestResponseIfAny(page, config);
        return {
          provider,
          content,
          codeBlocks,
          elapsedMs: Date.now() - startedAt,
        };
      }

      throw domTimeoutError(provider, 'Timed out waiting for LLM response');
    },
  };
}
