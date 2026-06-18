import type { Page } from 'playwright';
import { AppError } from '../../../shared/http/errors.js';
import { getLlmProviderConfig } from '../llm-browser.config.js';
import type { LlmBrowserProviderHandler } from '../llm-browser.provider.js';
import type {
  LlmBrowserProvider,
  LlmBrowserResponse,
  LlmProviderConfig,
  LlmReceiveResponseOptions,
  LlmSendPromptOptions,
  LlmSetupConfig,
} from '../llm-browser.types.js';
import {
  humanClick,
  humanPaste,
  humanPressEnter,
  humanScroll,
  humanWander,
  randomDelay,
  randomInt,
} from '../human-interaction.js';

const WARMUP_URL = 'https://www.google.com';

async function isPromptInputVisible(page: Page, config: LlmProviderConfig): Promise<boolean> {
  const selectors = config.selectors.promptInput.split(',').map((part) => part.trim());
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

function domTimeoutError(provider: LlmBrowserProvider, detail: string): AppError {
  return new AppError(`LLM DOM timeout (${provider}): ${detail}`, 502, 'LLM_DOM_TIMEOUT');
}

async function waitForFirstVisible(
  page: Page,
  provider: LlmBrowserProvider,
  selector: string,
  timeout = 30_000,
) {
  const selectors = selector.split(',').map((part) => part.trim());
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
    `No visible element for selectors: ${selectors.join(' | ')} (${lastError instanceof Error ? lastError.message : 'timeout'})`,
  );
}

async function isGenerating(page: Page, config: LlmProviderConfig): Promise<boolean> {
  const indicator = config.selectors.generatingIndicator;
  if (!indicator) return false;

  for (const candidate of indicator.split(',').map((part) => part.trim())) {
    const locator = page.locator(candidate).first();
    if (await locator.isVisible().catch(() => false)) {
      return true;
    }
  }

  return false;
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
      const text = ((await codes.nth(i).innerText().catch(() => '')) ?? '').trim();
      if (text) codeBlocks.push(text);
    }
  }

  return { content, codeBlocks };
}

export function createLlmProviderHandler(provider: LlmBrowserProvider): LlmBrowserProviderHandler {
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

    async sendPrompt(page: Page, prompt: string, options?: LlmSendPromptOptions): Promise<void> {
      const input = await waitForFirstVisible(page, provider, config.selectors.promptInput);
      await humanPaste(page, input, prompt);

      const submitWith = options?.submitWith ?? 'button';

      if (submitWith === 'enter') {
        await humanPressEnter(page);
      } else {
        const sendSelectors = config.selectors.sendButton.split(',').map((part) => part.trim());
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
      const timeoutMs = options?.timeoutMs ?? 120_000;
      const stableMs = options?.stableMs ?? 1_200;
      const deadline = startedAt + timeoutMs;

      let lastContent = '';
      let stableSince = 0;

      while (Date.now() < deadline) {
        const generating = await isGenerating(page, config);
        const { content, codeBlocks } = await extractResponse(page, config);

        if (content && content === lastContent && !generating) {
          if (stableSince === 0) {
            stableSince = Date.now();
          } else if (Date.now() - stableSince >= stableMs) {
            await humanScroll(page, 120);
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

      const { content, codeBlocks } = await extractResponse(page, config);
      if (content) {
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
