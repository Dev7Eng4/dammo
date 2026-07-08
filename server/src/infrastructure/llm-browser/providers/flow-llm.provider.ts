import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page, Locator, Response } from 'playwright';
import { AppError } from '../../../shared/http/errors.js';
import { FLOW_CONFIG, FLOW_BASE_URL, FLOW_INITIAL_SETUP_SELECTORS, FLOW_UPLOAD_IMAGE_PATH, buildFlowProjectUrl } from '../flow.config.js';
import { downloadAndSaveFlowImage, extractFifeUrl } from '../flow-api-response.js';
import type { FlowOpenOptions } from '../llm-browser.types.js';
import type { LlmBrowserProviderHandler } from '../llm-browser.provider.js';
import type {
  LlmBrowserResponse,
  LlmMediaAsset,
  LlmReceiveResponseOptions,
  LlmSendPromptOptions,
  LlmSetupConfig,
} from '../llm-browser.types.js';
import { humanClick, humanPaste, humanPressEnter, humanWander, randomDelay, setupClick } from '../human-interaction.js';

const WARMUP_URL = 'https://www.google.com';
const PROVIDER = 'flow' as const;
const configuredProjects = new Set<string>();

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

async function warmUpBeforeFlow(page: Page): Promise<void> {
  const currentUrl = page.url();
  if (!currentUrl.startsWith(WARMUP_URL)) {
    await page.goto(WARMUP_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  }
  await randomDelay(1_500, 3_000);
  await humanWander(page);
  await randomDelay(800, 1_500);
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

async function clickNewProjectButton(page: Page): Promise<void> {
  const roleButton = page.getByRole('button', { name: /New project/i }).first();
  if (await roleButton.isVisible().catch(() => false)) {
    await humanClick(page, roleButton);
    await randomDelay(500, 1_000);
    return;
  }

  const selectorButton = await waitForFirstVisible(page, FLOW_CONFIG.selectors.newProjectButton, 15_000);
  await humanClick(page, selectorButton);
  await randomDelay(500, 1_000);
}

function isOnFlowProjectPage(pageUrl: string, projectId: string): boolean {
  return pageUrl.includes('flow/project/') && pageUrl.includes(projectId);
}

async function isPromptInputReady(page: Page): Promise<boolean> {
  try {
    await waitForFirstVisible(page, FLOW_CONFIG.selectors.promptInput, 2_000);
    return true;
  } catch {
    return false;
  }
}

function parseProjectIdFromUrl(pageUrl: string): string | null {
  const match = pageUrl.match(/\/flow\/project\/([^/?#]+)/);
  return match?.[1] ?? null;
}

function resolveProjectId(page: Page, explicitProjectId?: string): string {
  if (explicitProjectId) return explicitProjectId;
  const parsed = parseProjectIdFromUrl(page.url());
  if (!parsed) {
    throw domTimeoutError(`Could not parse Flow project id from URL: ${page.url()}`);
  }
  return parsed;
}

type FlowSetupSelectorKey = (typeof FLOW_INITIAL_SETUP_SELECTORS)[number];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function popoverButtonByLabel(popover: Locator, label: string): Locator {
  return popover
    .locator('button')
    .filter({ hasText: new RegExp(escapeRegExp(label), 'i') })
    .first();
}

async function findVisibleSetupButton(page: Page, popover: Locator, label: string, fallbackXPath?: string): Promise<Locator | null> {
  const scopes: Locator[] = [popover];
  const submenu = page.locator(`xpath=${FLOW_CONFIG.selectors.modelSubmenuFallback}`);
  if (await submenu.isVisible().catch(() => false)) {
    scopes.push(submenu);
  }

  for (const scope of scopes) {
    const button = popoverButtonByLabel(scope, label);
    if (await button.isVisible().catch(() => false)) {
      return button;
    }
  }

  if (fallbackXPath) {
    const fallback = page.locator(`xpath=${fallbackXPath}`);
    if (await fallback.isVisible().catch(() => false)) {
      return fallback;
    }
  }

  return null;
}

async function isConfigPopoverOpen(page: Page): Promise<boolean> {
  return page
    .locator(`xpath=${FLOW_CONFIG.selectors.configPopoverFallback}`)
    .isVisible()
    .catch(() => false);
}

async function getConfigPopover(page: Page): Promise<Locator> {
  const fallback = page.locator(`xpath=${FLOW_CONFIG.selectors.configPopoverFallback}`);
  await fallback.waitFor({ state: 'visible', timeout: 15_000 });
  return fallback;
}

async function openConfigPopover(page: Page): Promise<Locator> {
  if (await isConfigPopoverOpen(page)) {
    return getConfigPopover(page);
  }

  const btnConfig = page.locator(`xpath=${FLOW_CONFIG.selectors.btnConfig}`);
  await setupClick(btnConfig);
  await randomDelay(300, 500);
  return getConfigPopover(page);
}

async function assertConfigPopoverOpen(page: Page, stepName: string): Promise<Locator> {
  if (await isConfigPopoverOpen(page)) {
    return getConfigPopover(page);
  }

  console.warn(`[flow] setup: popover closed after ${stepName}, re-opening`);
  return openConfigPopover(page);
}

async function getModelSubmenu(page: Page): Promise<Locator> {
  const menu = page.getByRole('menu').last();
  if (await menu.isVisible().catch(() => false)) {
    return menu;
  }

  const fallback = page.locator(`xpath=${FLOW_CONFIG.selectors.modelSubmenuFallback}`);
  await fallback.waitFor({ state: 'visible', timeout: 15_000 });
  return fallback;
}

async function clickPopoverButton(page: Page, popover: Locator, label: string, fallbackXPath?: string): Promise<void> {
  const target = await findVisibleSetupButton(page, popover, label, fallbackXPath);
  if (target) {
    await setupClick(target);
    return;
  }

  throw domTimeoutError(`Setup option "${label}" not found in config popover`);
}

async function clickImageOption(page: Page, popover: Locator): Promise<void> {
  const label = FLOW_CONFIG.selectors.btnOptionImage;
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const imageButton = await findVisibleSetupButton(page, popover, label, FLOW_CONFIG.selectors.btnOptionImageFallback);
    if (imageButton) {
      await setupClick(imageButton);
      return;
    }

    const typeTrigger = page.locator(`xpath=${FLOW_CONFIG.selectors.btnOptionImageTrigger}`);
    if (await typeTrigger.isVisible().catch(() => false)) {
      await setupClick(typeTrigger);
      await randomDelay(300, 500);
      continue;
    }

    await randomDelay(200, 400);
  }

  throw domTimeoutError(`Setup option "${label}" not found in config popover`);
}

async function clickModelInPopover(page: Page, popover: Locator): Promise<void> {
  const modelDropdown = popover
    .locator(FLOW_CONFIG.selectors.btnOptionModel)
    .filter({ hasText: /Nano Banana/i })
    .first();

  if (await modelDropdown.isVisible().catch(() => false)) {
    await setupClick(modelDropdown);
    return;
  }

  await setupClick(page.locator(`xpath=${FLOW_CONFIG.selectors.btnOptionModelFallback}`));
}

async function clickModelProInSubmenu(page: Page): Promise<void> {
  const menu = await getModelSubmenu(page);
  const label = FLOW_CONFIG.selectors.btnOptionModelPro;

  const menuItem = menu.getByRole('menuitem', { name: new RegExp(label, 'i') }).first();
  if (await menuItem.isVisible().catch(() => false)) {
    const innerButton = menuItem.locator('button').first();
    if (await innerButton.isVisible().catch(() => false)) {
      await setupClick(innerButton);
      return;
    }
    await setupClick(menuItem);
    return;
  }

  const buttonInMenu = menu
    .locator('button')
    .filter({ hasText: new RegExp(label, 'i') })
    .first();
  if (await buttonInMenu.isVisible().catch(() => false)) {
    await setupClick(buttonInMenu);
    return;
  }

  await setupClick(page.locator(`xpath=${FLOW_CONFIG.selectors.btnOptionModelProFallback}`));
}

async function runSetupStep(page: Page, popover: Locator, selectorKey: FlowSetupSelectorKey): Promise<Locator> {
  switch (selectorKey) {
    case 'btnConfig':
      return popover;
    case 'btnOptionImage':
      await clickImageOption(page, popover);
      return assertConfigPopoverOpen(page, selectorKey);
    case 'btnOptionRatio':
      await clickPopoverButton(page, popover, FLOW_CONFIG.selectors.btnOptionRatio);
      return assertConfigPopoverOpen(page, selectorKey);
    case 'btnOptionQuantity':
      await clickPopoverButton(page, popover, FLOW_CONFIG.selectors.btnOptionQuantity);
      return assertConfigPopoverOpen(page, selectorKey);
    case 'btnOptionModel':
      await clickModelInPopover(page, popover);
      return popover;
    case 'btnOptionModelPro':
      await clickModelProInSubmenu(page);
      return popover;
    default:
      return popover;
  }
}

async function ensureInitialProjectSetup(page: Page, projectId: string): Promise<void> {
  if (configuredProjects.has(projectId)) return;

  console.log(`[flow] running initial setup for project ${projectId}...`);

  let popover = await openConfigPopover(page);

  for (const selectorKey of FLOW_INITIAL_SETUP_SELECTORS) {
    if (selectorKey === 'btnConfig') {
      console.log('[flow] setup step: btnConfig');
      continue;
    }

    console.log(`[flow] setup step: ${selectorKey}`);
    popover = await runSetupStep(page, popover, selectorKey);
  }

  await page.keyboard.press('Escape');
  await randomDelay(400, 800);
  await waitForProjectReady(page);
  configuredProjects.add(projectId);
  console.log(`[flow] initial setup done for project ${projectId}`);
}

async function waitForProjectReady(page: Page): Promise<void> {
  await waitForFirstVisible(page, FLOW_CONFIG.selectors.promptInput, 45_000);
  await randomDelay(400, 900);
}

async function assertPromptFilled(locator: Locator, prompt: string): Promise<void> {
  const expectedLength = prompt.trim().length;
  const length = await locator.evaluate(el => {
    const target = el as HTMLElement;
    if (target.isContentEditable) return (target.textContent ?? '').trim().length;
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) return target.value.trim().length;
    return 0;
  });
  if (length < expectedLength) {
    throw domTimeoutError(`Prompt not filled before submit: expected ${expectedLength}, got ${length}`);
  }
}

function beginUploadImageWait(page: Page, timeoutMs = 60_000): Promise<Response> {
  return page.waitForResponse(
    response =>
      response.url().includes(FLOW_UPLOAD_IMAGE_PATH) &&
      response.request().method() === 'POST' &&
      response.ok(),
    { timeout: timeoutMs },
  );
}

async function attachReferenceFile(page: Page, imagePath: string): Promise<void> {
  const attachButton = page.locator(`xpath=${FLOW_CONFIG.selectors.btnAttach}`);
  await humanClick(page, attachButton);
  await randomDelay(500, 1_000);

  try {
    const uploadButton = await waitForFirstVisible(page, FLOW_CONFIG.selectors.btnUploadMedia, 10_000);
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 10_000 }),
      humanClick(page, uploadButton),
    ]);
    await fileChooser.setFiles(imagePath);
    console.log(`[flow] selected reference image via Upload media: ${imagePath}`);
    return;
  } catch {
    // fallback below
  }

  const fileInput = page.locator(FLOW_CONFIG.selectors.referenceImageInput).first();
  await fileInput.waitFor({ state: 'attached', timeout: 10_000 });
  await fileInput.setInputFiles(imagePath);
  console.log(`[flow] selected reference image via file input: ${imagePath}`);
}

async function uploadReferenceImage(page: Page, imagePath: string): Promise<void> {
  await fs.access(imagePath);

  const uploadPromise = beginUploadImageWait(page);

  await attachReferenceFile(page, imagePath);

  try {
    await uploadPromise;
    console.log('[flow] uploadImage API success');
  } catch (err) {
    throw domTimeoutError(
      `Timed out waiting for uploadImage API (${err instanceof Error ? err.message : 'unknown error'})`,
    );
  }

  const addToPromptButton = await waitForFirstVisible(page, FLOW_CONFIG.selectors.addToPromptButton, 15_000);
  await humanClick(page, addToPromptButton);
  await randomDelay(500, 1_000);
}

export function createFlowProviderHandler(): LlmBrowserProviderHandler {
  return {
    provider: PROVIDER,

    async open(page: Page, options?: FlowOpenOptions): Promise<void> {
      const projectId = options?.projectId;
      const skipInitialSetup = options?.skipInitialSetup === true;

      if (projectId && isOnFlowProjectPage(page.url(), projectId) && (await isPromptInputReady(page))) {
        if (!skipInitialSetup) {
          await ensureInitialProjectSetup(page, projectId);
        }
        return;
      }

      if (skipInitialSetup && projectId) {
        await page.goto(buildFlowProjectUrl(projectId), { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await randomDelay(1_000, 2_000);
        await page.keyboard.press('Escape');
        return;
      }

      await warmUpBeforeFlow(page);

      if (projectId) {
        await page.goto(buildFlowProjectUrl(projectId), { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await randomDelay(2_000, 4_000);
        await waitForProjectReady(page);
        await ensureInitialProjectSetup(page, projectId);
        return;
      }

      await page.goto(FLOW_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await randomDelay(2_000, 4_000);
      await clickNewProjectButton(page);
      await waitForProjectReady(page);
      const newProjectId = resolveProjectId(page);
      await ensureInitialProjectSetup(page, newProjectId);
    },

    async setupConfig(page: Page, setup: LlmSetupConfig): Promise<void> {
      if (setup.mode && setup.mode !== 'image') return;
      const projectId = resolveProjectId(page);
      await ensureInitialProjectSetup(page, projectId);
    },

    async readConversationIfNeeded(_page: Page): Promise<void> {
      // Flow is stateless per generation; no conversation scroll needed.
    },

    async sendPrompt(page: Page, prompt: string, options?: LlmSendPromptOptions): Promise<void> {
      if (options?.referenceImagePath) {
        await uploadReferenceImage(page, options.referenceImagePath);
      }

      const input = await waitForFirstVisible(page, FLOW_CONFIG.selectors.promptInput);
      await humanPaste(page, input, prompt, { pasteStrategy: options?.pasteStrategy ?? 'insertText' });
      await assertPromptFilled(input, prompt);
      await humanPressEnter(page);
      await randomDelay(500, 1_000);
    },

    async receiveResponse(page: Page, options?: LlmReceiveResponseOptions): Promise<LlmBrowserResponse> {
      const startedAt = Date.now();
      const batchResponsePromise = options?.batchResponsePromise;
      if (!batchResponsePromise) {
        throw new AppError('Flow batchResponsePromise is required for receiveResponse', 500, 'FLOW_API_WAIT_MISSING');
      }

      try {
        const apiResponse = await batchResponsePromise;
        const payload = await apiResponse.json();
        const imageUrl = extractFifeUrl(payload);
        console.log(`[flow-api] extracted image url: ${imageUrl.slice(0, 80)}...`);

        const mediaAssets: LlmMediaAsset[] = [];
        if (options?.outputPath) {
          mediaAssets.push(await downloadAndSaveFlowImage(page, imageUrl, options.outputPath));
        } else {
          mediaAssets.push({ kind: 'image', sourceUrl: imageUrl });
        }

        return {
          provider: PROVIDER,
          content: '',
          codeBlocks: [],
          elapsedMs: Date.now() - startedAt,
          mediaAssets,
        };
      } catch (err) {
        await captureDebugScreenshot(page, options?.debugScreenshotPath);
        if (err instanceof AppError) throw err;
        throw domTimeoutError(
          `Timed out or failed waiting for Flow batchGenerateImages (${err instanceof Error ? err.message : 'unknown error'})`,
        );
      }
    },
  };
}
