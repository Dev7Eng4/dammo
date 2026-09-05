import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page, Locator } from 'playwright';
import { AppError } from '../../../shared/http/errors.js';
import {
  FLOW_CONFIG,
  FLOW_BASE_URL,
  FLOW_INITIAL_SETUP_SELECTORS,
  MAVID_EDITOR_TOOL_ID,
  buildFlowProjectUrl,
  buildFlowToolUrl,
} from '../flow.config.js';
import { downloadAndSaveFlowImage } from '../flow-api-response.js';
import { appErrorFromFlowErrorTileText } from '../flow-api-errors.js';
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
import { resolveReferenceImagePaths } from '../resolve-reference-image-paths.js';

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

async function findVisibleRoleButton(page: Page, name: RegExp): Promise<Locator | null> {
  const button = page.getByRole('button', { name }).first();
  if (await button.isVisible().catch(() => false)) {
    return button;
  }
  return null;
}

async function findVisibleSelectorButton(page: Page, selector: string): Promise<Locator | null> {
  for (const candidate of splitSelectors(selector)) {
    const locator = page.locator(candidate).last();
    if (await locator.isVisible().catch(() => false)) {
      return locator;
    }
  }
  return null;
}

async function dismissDialogIfPresent(page: Page): Promise<void> {
  try {
    const dialog = page.locator(FLOW_CONFIG.selectors.dialog).last();
    if (!(await dialog.isVisible().catch(() => false))) return;

    const lastButton = dialog.locator('button').last();
    if (!(await lastButton.isVisible().catch(() => false))) return;

    await humanClick(page, lastButton);
    await randomDelay(500, 1_000);
  } catch (err) {
    console.warn('[flow] dismissDialogIfPresent skipped:', err instanceof Error ? err.message : err);
  }
}

async function clickNewProjectButton(page: Page): Promise<void> {
  await dismissDialogIfPresent(page);

  const pollTimeoutMs = 15_000;
  const deadline = Date.now() + pollTimeoutMs;
  let clickedCreateWithFlow = false;

  while (Date.now() < deadline) {
    const newProjectButton =
      (await findVisibleRoleButton(page, /New project/i)) ??
      (await findVisibleSelectorButton(page, FLOW_CONFIG.selectors.newProjectButton));
    if (newProjectButton) {
      await humanClick(page, newProjectButton);
      await randomDelay(500, 1_000);
      return;
    }

    if (!clickedCreateWithFlow) {
      const createWithFlowButton =
        (await findVisibleRoleButton(page, /Create with Google Flow/i)) ??
        (await findVisibleSelectorButton(page, FLOW_CONFIG.selectors.createWithGoogleFlowButton));
      if (createWithFlowButton) {
        await humanClick(page, createWithFlowButton);
        await randomDelay(500, 1_000);
        clickedCreateWithFlow = true;
      }
    }

    await randomDelay(200, 400);
  }

  try {
    const newProjectButton = await waitForFirstVisible(page, FLOW_CONFIG.selectors.newProjectButton, 15_000);
    await humanClick(page, newProjectButton);
    await randomDelay(500, 1_000);
  } catch {
    throw domTimeoutError(
      clickedCreateWithFlow
        ? 'Timed out waiting for "New project" after clicking "Create with Google Flow"'
        : 'Neither "New project" nor "Create with Google Flow" button found on Flow landing page',
    );
  }
}

function isOnFlowProjectPage(pageUrl: string, projectId: string): boolean {
  return parseProjectIdFromUrl(pageUrl) === projectId;
}

async function isPromptEditableEnabled(locator: Locator): Promise<boolean> {
  return locator
    .evaluate(el => {
      const target = el as HTMLElement;
      if (target.getAttribute('aria-disabled') === 'true') return false;
      if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
        return !target.disabled && !target.readOnly;
      }
      if (target.isContentEditable || target.getAttribute('contenteditable') === 'true' || target.getAttribute('role') === 'textbox') {
        return true;
      }
      return false;
    })
    .catch(() => false);
}

/** Wait until prompt input is visible and enabled/editable. */
async function waitForPromptInputEnabled(page: Page, timeoutMs: number): Promise<Locator> {
  const deadline = Date.now() + timeoutMs;
  const promptRoot = await waitForFirstVisible(page, FLOW_CONFIG.selectors.promptInput, timeoutMs);
  const input = await resolveEditableLocator(promptRoot);
  while (Date.now() < deadline) {
    if (await isPromptEditableEnabled(input)) return input;
    await randomDelay(200, 400);
  }
  throw domTimeoutError(`promptInput not enabled within ${timeoutMs}ms (${FLOW_CONFIG.selectors.promptInput})`);
}

async function isPromptInputReady(page: Page): Promise<boolean> {
  try {
    await waitForPromptInputEnabled(page, 2_000);
    return true;
  } catch {
    return false;
  }
}

function parseProjectIdFromUrl(pageUrl: string): string | null {
  const match = pageUrl.match(/\/flow\/project\/([^/?#]+)/) ?? pageUrl.match(/\/project\/([^/?#]+)/);
  return match?.[1] ?? null;
}

/**
 * Navigate to a Flow project and confirm it is usable.
 * Signal: URL contains projectId + prompt input visible and enabled.
 */
export async function openFlowProjectPage(page: Page, projectId: string, timeoutMs = 60_000): Promise<boolean> {
  await page.goto(buildFlowProjectUrl(projectId), { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  await dismissDialogIfPresent(page);
  await page.keyboard.press('Escape');

  const parsedId = parseProjectIdFromUrl(page.url());
  if (parsedId !== projectId) {
    console.warn(`[flow] project URL mismatch after goto: expected ${projectId}, got ${page.url()}`);
    return false;
  }

  try {
    await waitForFlowProjectReady(page);
  } catch (err) {
    console.warn(
      `[flow] prompt not ready for ${projectId}:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }

  console.log(`[flow] project ${projectId} valid (URL + DOM)`);
  return true;
}

/** Open Flow home, create a new project, run initial setup, and return the new project id. */
export async function createNewFlowProject(page: Page): Promise<string> {
  await warmUpBeforeFlow(page);
  await page.goto(FLOW_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await randomDelay(2_000, 4_000);
  await clickNewProjectButton(page);
  await waitForFlowProjectReady(page);
  const newProjectId = resolveProjectId(page);
  console.log(`[flow] new project id from URL: ${newProjectId}`);
  await ensureInitialProjectSetup(page, newProjectId);
  return newProjectId;
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

async function findVisibleSetupButton(page: Page, popover: Locator, label: string): Promise<Locator | null> {
  const scopes: Locator[] = [popover];
  const submenu = page.locator(FLOW_CONFIG.selectors.modelPickerPanel);
  if (await submenu.isVisible().catch(() => false)) {
    scopes.push(submenu);
  }

  for (const scope of scopes) {
    const button = popoverButtonByLabel(scope, label);
    if (await button.isVisible().catch(() => false)) {
      return button;
    }
  }

  return null;
}

async function isConfigPopoverOpen(page: Page): Promise<boolean> {
  return page
    .locator(FLOW_CONFIG.selectors.configPopover)
    .isVisible()
    .catch(() => false);
}

async function getConfigPopover(page: Page): Promise<Locator> {
  const popover = page.locator(FLOW_CONFIG.selectors.configPopover);
  await popover.waitFor({ state: 'visible', timeout: 15_000 });
  return popover;
}

async function openConfigPopover(page: Page): Promise<Locator> {
  if (await isConfigPopoverOpen(page)) {
    console.log('[flow] config popover already open');
    return getConfigPopover(page);
  }

  console.log(`[flow] clicking btnConfig (${FLOW_CONFIG.selectors.btnConfig})...`);
  const btnConfig = page.locator(FLOW_CONFIG.selectors.btnConfig);
  await setupClick(btnConfig);
  await randomDelay(300, 500);
  const popover = await getConfigPopover(page);
  console.log('[flow] config popover open');
  return popover;
}

async function assertConfigPopoverOpen(page: Page, stepName: string): Promise<Locator> {
  if (await isConfigPopoverOpen(page)) {
    return getConfigPopover(page);
  }

  console.warn(`[flow] setup: popover closed after ${stepName}, re-opening`);
  return openConfigPopover(page);
}

async function getModelSubmenu(page: Page): Promise<Locator> {
  const menu = page.locator(FLOW_CONFIG.selectors.modelPickerPanel);
  await menu.waitFor({ state: 'visible', timeout: 15_000 });
  return menu;
}

async function clickPopoverButton(page: Page, popover: Locator, label: string): Promise<void> {
  const target = await findVisibleSetupButton(page, popover, label);
  if (target) {
    await setupClick(target);
    return;
  }

  throw domTimeoutError(`Setup option "${label}" not found in config popover`);
}

async function clickModelInPopover(page: Page, popover: Locator): Promise<void> {
  const modelDropdown = popover.locator(FLOW_CONFIG.selectors.btnOptionModel);
  await modelDropdown.waitFor({ state: 'visible', timeout: 15_000 });
  await setupClick(modelDropdown);
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
      await clickPopoverButton(page, popover, FLOW_CONFIG.selectors.btnOptionImage);
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

export async function ensureInitialProjectSetup(page: Page, projectId: string): Promise<void> {
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
  await waitForFlowProjectReady(page);
  configuredProjects.add(projectId);
  console.log(`[flow] initial setup done for project ${projectId}`);
}

export async function waitForFlowProjectReady(page: Page): Promise<void> {
  await waitForPromptInputEnabled(page, 45_000);
  await randomDelay(400, 900);
}

async function isMavidEditorReady(locator: Locator): Promise<boolean> {
  return locator
    .evaluate(el => {
      const ta = el as HTMLTextAreaElement;
      const visible = ta.offsetParent !== null || ta.getClientRects().length > 0;
      const enabled = !ta.disabled && !ta.readOnly;
      return visible && enabled;
    })
    .catch(() => false);
}

/**
 * Locate the mavid editor textarea across all frames of the page.
 *
 * The custom tool DOM lives inside a child iframe of the Flow project page, so a
 * page-level locator never matches. Scan every frame (including the main frame)
 * for `textarea#david-input-prompts`, polling until one is present, visible and
 * enabled (i.e. the tool has finished loading).
 */
async function locateMavidEditorInFrames(page: Page, timeoutMs: number): Promise<Locator> {
  const selector = FLOW_CONFIG.selectors.mavidEditorPrompt;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      const locator = frame.locator(selector).last();
      const count = await locator.count().catch(() => 0);
      if (count > 0 && (await isMavidEditorReady(locator))) {
        await randomDelay(400, 900);
        return locator;
      }
    }

    await randomDelay(300, 600);
  }

  throw domTimeoutError('#david-input-prompts not found in any frame (tool still loading)');
}

/**
 * Wait until the mavid editor textarea is loaded and interactive.
 *
 * The textarea renders asynchronously inside a child iframe; delegates to a frame
 * scan so both direct and iframe-hosted DOM are handled.
 */
async function waitForMavidEditorReady(page: Page, timeoutMs = 120_000): Promise<Locator> {
  return locateMavidEditorInFrames(page, timeoutMs);
}

/**
 * Open the "mavid editor" custom tool page for a project and wait for its prompt input.
 * Tool pages do not use the project config popover, so no initial setup is run here.
 */
export async function openFlowToolPage(page: Page, projectId: string, toolId: string = MAVID_EDITOR_TOOL_ID): Promise<void> {
  await page.goto(buildFlowToolUrl(projectId, toolId), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await randomDelay(1_000, 2_000);
  await page.keyboard.press('Escape');

  // Wait for the tool to finish loading (network settles) before touching the textarea.
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => undefined);
  await waitForMavidEditorReady(page);
}

/** Fill the mavid editor prompt input with the given text (JSON) and submit via Enter. */
export async function submitMavidEditorPrompt(page: Page, promptText: string): Promise<void> {
  const input = await waitForMavidEditorReady(page);
  await humanPaste(page, input, promptText, { pasteStrategy: 'human' });
  await assertPromptFilled(input, promptText);
  await humanPressEnter(page);
  await randomDelay(500, 1_000);
}

async function resolveEditableLocator(locator: Locator): Promise<Locator> {
  const isEditable = await locator
    .evaluate(el => {
      const target = el as HTMLElement;
      return (
        target.isContentEditable ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLInputElement ||
        target.getAttribute('role') === 'textbox'
      );
    })
    .catch(() => false);

  if (isEditable) return locator;

  const nested = locator.locator('[contenteditable="true"], [role="textbox"], textarea, input').first();
  if (await nested.isVisible().catch(() => false)) {
    return nested;
  }

  return locator;
}

async function assertPromptFilled(locator: Locator, prompt: string): Promise<void> {
  const expectedLength = prompt.trim().length;
  const length = await locator.evaluate(el => {
    const target = el as HTMLElement;
    const nested =
      target.isContentEditable ||
      target.getAttribute('role') === 'textbox' ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLInputElement
        ? target
        : target.querySelector<HTMLElement>('[contenteditable="true"], [role="textbox"], textarea, input');
    if (!nested) return 0;
    if (nested instanceof HTMLTextAreaElement || nested instanceof HTMLInputElement) {
      return nested.value.trim().length;
    }
    return (nested.textContent ?? '').trim().length;
  });
  if (length < expectedLength) {
    throw domTimeoutError(`Prompt not filled before submit: expected ${expectedLength}, got ${length}`);
  }
}

async function attachReferenceFile(page: Page, imagePath: string, _index: number): Promise<void> {
  const attachButton = page.locator(FLOW_CONFIG.selectors.btnAttach);
  await humanClick(page, attachButton);
  await randomDelay(500, 1_000);

  try {
    const uploadButton = await waitForFirstVisible(page, FLOW_CONFIG.selectors.btnUploadMedia, 10_000);
    const [fileChooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10_000 }), humanClick(page, uploadButton)]);
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

async function uploadReferenceImage(page: Page, imagePath: string, index: number): Promise<void> {
  await fs.access(imagePath);

  await attachReferenceFile(page, imagePath, index);

  await randomDelay(1_000, 1_000);

  const assetButton = page.locator(FLOW_CONFIG.selectors.assetItemButton).first();
  await assetButton.waitFor({ state: 'visible', timeout: 15_000 });
  await humanClick(page, assetButton);

  const addToPromptButton = page.locator(FLOW_CONFIG.selectors.addToPromptButton).first();
  await addToPromptButton.waitFor({ state: 'visible', timeout: 15_000 });

  const enabledDeadline = Date.now() + 15_000;
  while (Date.now() < enabledDeadline) {
    if (await addToPromptButton.isEnabled().catch(() => false)) break;
    await randomDelay(200, 400);
  }
  if (!(await addToPromptButton.isEnabled().catch(() => false))) {
    throw domTimeoutError(`addToPromptButton not enabled within 15s (${FLOW_CONFIG.selectors.addToPromptButton})`);
  }

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
        await dismissDialogIfPresent(page);
        if (!skipInitialSetup) {
          await ensureInitialProjectSetup(page, projectId);
        }
        return;
      }

      if (projectId) {
        const valid = await openFlowProjectPage(page, projectId);
        if (!valid) {
          throw domTimeoutError(`Flow project ${projectId} failed project open validation`);
        }
        if (!skipInitialSetup) {
          await randomDelay(2_000, 4_000);
          await ensureInitialProjectSetup(page, projectId);
        }
        return;
      }

      await createNewFlowProject(page);
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
      const referencePaths = resolveReferenceImagePaths(options);
      if (referencePaths.length > 0) {
        console.log(`[flow] uploading ${referencePaths.length} reference image(s)...`);
      }
      for (let i = 0; i < referencePaths.length; i++) {
        console.log(`[flow] reference upload ${i + 1}/${referencePaths.length}: ${referencePaths[i]}`);
        await uploadReferenceImage(page, referencePaths[i], i);
        await randomDelay(400, 900);
      }

      console.log(`[flow] waiting for promptInput (${FLOW_CONFIG.selectors.promptInput})...`);
      const promptRoot = await waitForFirstVisible(page, FLOW_CONFIG.selectors.promptInput);
      const input = await resolveEditableLocator(promptRoot);
      console.log('[flow] promptInput visible, pasting...');
      await humanPaste(page, input, prompt, { pasteStrategy: options?.pasteStrategy ?? 'human' });
      await assertPromptFilled(input, prompt);
      console.log('[flow] prompt filled, pressing Enter...');
      await humanPressEnter(page);
      await randomDelay(500, 1_000);
      console.log('[flow] sendPrompt submitted');
    },

    async receiveResponse(page: Page, options?: LlmReceiveResponseOptions): Promise<LlmBrowserResponse> {
      const startedAt = Date.now();
      const batchResponsePromise = options?.batchResponsePromise;
      if (!batchResponsePromise) {
        throw new AppError('Flow batchResponsePromise is required for receiveResponse', 500, 'FLOW_API_WAIT_MISSING');
      }

      const timeoutMs = options?.timeoutMs ?? FLOW_CONFIG.defaultTimeoutMs;
      let settled = false;

      const stopPolling = (): void => {
        settled = true;
      };

      const cdnSuccess = (async (): Promise<LlmBrowserResponse> => {
        console.log('[flow] waiting for flow-content image response...');
        const apiResponse = await batchResponsePromise;
        stopPolling();
        const imageUrl = apiResponse.url();
        console.log(`[flow-cdn] image url: ${imageUrl.split('?')[0]} (status=${apiResponse.status()})`);

        const mediaAssets: LlmMediaAsset[] = [];
        if (options?.outputPath) {
          console.log(`[flow] downloading image → ${options.outputPath}`);
          mediaAssets.push(await downloadAndSaveFlowImage(page, imageUrl, options.outputPath));
          console.log('[flow] download saved');
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
      })();

      const errorPoll = (async (): Promise<LlmBrowserResponse> => {
        await randomDelay(500, 500);

        const scroll = page.locator(FLOW_CONFIG.selectors.virtualScrollContainer).first();
        await scroll.waitFor({ state: 'attached', timeout: Math.min(15_000, timeoutMs) }).catch(() => undefined);

        const deadline = startedAt + timeoutMs;
        while (!settled && Date.now() < deadline) {
          const firstItem = scroll.locator(FLOW_CONFIG.selectors.virtualItemContainer).first();
          const errorTile = firstItem.locator(FLOW_CONFIG.selectors.flowErrorTile).first();
          const hasError = await errorTile.isVisible().catch(() => false);
          if (hasError) {
            const text = ((await errorTile.innerText().catch(() => '')) || '').trim();
            console.warn(`[flow] error tile detected: ${text.slice(0, 200)}`);
            stopPolling();
            void batchResponsePromise.catch(() => undefined);
            void cdnSuccess.catch(() => undefined);
            throw appErrorFromFlowErrorTileText(text || 'unknown flow-error-tile');
          }
          await randomDelay(1_000, 1_000);
        }

        if (!settled) {
          throw domTimeoutError(`Timed out waiting for Flow image or error tile (${timeoutMs}ms)`);
        }

        // CDN won; this branch is discarded by Promise.race.
        return new Promise(() => undefined);
      })();

      try {
        return await Promise.race([cdnSuccess, errorPoll]);
      } catch (err) {
        stopPolling();
        void batchResponsePromise.catch(() => undefined);
        void cdnSuccess.catch(() => undefined);
        console.error(`[flow] receiveResponse failed: ${err instanceof Error ? err.message : String(err)}`);
        await captureDebugScreenshot(page, options?.debugScreenshotPath);
        if (err instanceof AppError) throw err;
        throw domTimeoutError(
          `Timed out or failed waiting for Flow content image (${err instanceof Error ? err.message : 'unknown error'})`,
        );
      }
    },
  };
}
