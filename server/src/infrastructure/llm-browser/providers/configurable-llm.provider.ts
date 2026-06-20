import type { Page } from 'playwright';
import { AppError } from '../../../shared/http/errors.js';
import { getLlmProviderConfig } from '../llm-browser.config.js';
import type { LlmBrowserProviderHandler } from '../llm-browser.provider.js';
import type {
  LlmBrowserProvider,
  LlmBrowserResponse,
  LlmTextProvider,
  LlmProviderConfig,
  LlmReceiveResponseOptions,
  LlmSendPromptOptions,
  LlmSendPromptResult,
  LlmSetupConfig,
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

async function waitForNewResponse(page: Page, config: LlmProviderConfig, baselineBlockCount: number, deadline: number): Promise<void> {
  while (Date.now() < deadline) {
    const blockCount = await countResponseBlocks(page, config);
    const generating = await isGenerating(page, config);
    if (blockCount > baselineBlockCount || generating) {
      return;
    }
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

async function extractResponse(page: Page, config: LlmProviderConfig): Promise<{ content: string; codeBlocks: string[] }> {
  const blocks = page.locator(config.selectors.responseBlocks);
  const count = await blocks.count();
  if (count === 0) {
    return { content: '', codeBlocks: [] };
  }

  const lastBlock = blocks.nth(count - 1);
  const content = ((await lastBlock.innerText().catch(() => '')) ?? '').trim();

  const codeBlocks: string[] = [];
  if (config.selectors.responseCodeBlocks) {
    const codes = lastBlock.locator(config.selectors.responseCodeBlocks);
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

    async open(page: Page): Promise<void> {
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
      await humanPaste(page, input, prompt, { pasteStrategy: options?.pasteStrategy });

      const baselineBlockCount = await countResponseBlocks(page, config);

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

      const baselineBlockCount = options?.baselineBlockCount ?? (await countResponseBlocks(page, config));

      await randomDelay(1_500, 1_500);
      await scrollConversationContainer(page, config, randomInt(80, 200));

      await waitForNewResponse(page, config, baselineBlockCount, deadline);

      let lastContent = '';
      let stableSince = 0;

      while (Date.now() < deadline) {
        const generating = await isGenerating(page, config);
        const { content, codeBlocks } = await extractResponse(page, config);

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
      const { content, codeBlocks } = await extractResponse(page, config);
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
