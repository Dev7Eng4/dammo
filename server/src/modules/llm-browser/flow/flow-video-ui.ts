import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { appErrorFromFlowErrorTileText, createFlowDailyQuotaError } from './api/flow-api-errors.js';
import { downloadFlowVideo } from './api/flow-video.client.js';
import { FLOW_CONFIG } from './flow.config.js';
import { uploadReferenceImage } from './flow.provider.js';
import { AppError } from '../../../shared/http/errors.js';
import { emitDetailLog } from '../../video-production/shared/video-log.js';

/**
 * Image → video through the flow.google.com UI (the old labs.google token endpoint answers 410).
 *
 * Prompt-bar settings popover: Video · Ingredients · aspect · model · x1, then the scene image is
 * attached as the only ingredient (+ → Upload media → asset → Add to prompt, as for image references).
 */

export const FLOW_VIDEO_DEFAULT_MODEL = 'Veo 3.1 - Lite';
export type FlowVideoAspectRatio = '16:9' | '9:16';

export interface FlowVideoUiSettings {
  model: string;
  aspectRatio: FlowVideoAspectRatio;
}

/**
 * TEMPORARY: only pick the prompt-bar settings, then stop (no frame, prompt or generation) and leave
 * the Chrome window in front so the settings can be checked by eye. Set to false to make clips.
 */
export const FLOW_VIDEO_SETTINGS_ONLY = false;
export const FLOW_VIDEO_SETTINGS_ONLY_REASON = 'Chế độ kiểm tra: chỉ chọn setting, chưa nhập prompt / tạo video';

/** One clip from submit to downloadable result. */
export const FLOW_VIDEO_CLIP_TIMEOUT_MS = 6 * 60_000;
const POLL_MS = 4_000;
const UPLOAD_TIMEOUT_MS = 90_000;

const VIDEO_URL_PATTERN = /https:\/\/flow-content\.google\/video\/[^"'\s)<>]+/g;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function overlay(page: Page): Locator {
  return page.locator('.cdk-overlay-container');
}

function settingsTrigger(page: Page): Locator {
  return page.getByRole('button', { name: 'Settings trigger' });
}

async function pickToggle(page: Page, label: string | RegExp): Promise<void> {
  const toggle = overlay(page).getByRole('radio', { name: label }).first();
  await toggle.waitFor({ state: 'visible', timeout: 10_000 });
  if ((await toggle.getAttribute('aria-checked')) !== 'true') {
    await toggle.click();
    await sleep(500);
  }
}

/**
 * Opens the settings popover and selects Video · Ingredients · aspect · model · x1, one step at a
 * time like the image setup. `keepOpen` leaves the popover showing so the choices can be checked.
 */
export async function configureFlowVideoSettings(
  page: Page,
  settings: FlowVideoUiSettings,
  options: { keepOpen?: boolean } = {},
): Promise<void> {
  await settingsTrigger(page).click();
  await overlay(page).getByRole('radio', { name: /Video/ }).first().waitFor({ state: 'visible', timeout: 15_000 });
  await sleep(800);

  await pickToggle(page, /Video/);
  await sleep(600);
  await pickToggle(page, /Ingredients/);
  await sleep(600);
  await pickToggle(page, new RegExp(settings.aspectRatio.replace(':', '\\:')));
  await sleep(600);

  const modelButton = overlay(page).getByRole('button', { name: 'Select model family' });
  if (!(await modelButton.innerText()).includes(settings.model)) {
    await modelButton.click();
    const item = overlay(page).getByRole('menuitem').filter({ hasText: settings.model }).first();
    await item.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {
      throw new AppError(`Flow model "${settings.model}" not found in the model menu`, 502, 'FLOW_MODEL_NOT_FOUND');
    });
    await item.click();
    await sleep(500);
  }

  await sleep(600);
  await pickToggle(page, /^x1$/);
  if (options.keepOpen) {
    emitDetailLog(`[flow-video-ui] settings picked (popover left open): Video · Ingredients · ${settings.aspectRatio} · ${settings.model} · x1`);
    return;
  }
  await page.keyboard.press('Escape');
  await sleep(500);

  const summary = (await settingsTrigger(page).innerText()).replace(/\s+/g, ' ');
  if (!summary.startsWith('Video')) {
    throw new AppError(`Flow settings did not switch to video (got "${summary}")`, 502, 'FLOW_VIDEO_SETTINGS_FAILED');
  }
  emitDetailLog(`[flow-video-ui] settings: ${summary} · ${settings.model}`);
}

/** Image chips in the prompt bar (ingredients attached for the current clip). */
function ingredientChips(page: Page): Locator {
  return page.locator('.ingredient-bar-container button.chip-container');
}

/** Removes ingredients left from the previous clip (hover a chip → its cancel icon). */
async function clearIngredients(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const chip = ingredientChips(page).first();
    if (!(await chip.isVisible().catch(() => false))) return;
    await chip.hover();
    await sleep(300);
    const cancel = chip.locator('.hover-icon-overlay').first();
    if (await cancel.isVisible().catch(() => false)) await cancel.click();
    else await chip.click();
    await sleep(800);
    await page.keyboard.press('Escape').catch(() => undefined);
  }
  if (await ingredientChips(page).first().isVisible().catch(() => false)) {
    throw new AppError('Could not clear the previous Flow ingredient', 502, 'FLOW_INGREDIENT_NOT_CLEARED');
  }
}

/** Attaches the image as the clip's only ingredient, the same way image generation attaches references. */
async function attachIngredient(page: Page, imagePath: string, uploadName: string): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flow-frame-'));
  const uploadPath = path.join(tempDir, uploadName);
  await fs.copyFile(imagePath, uploadPath);
  try {
    await clearIngredients(page);
    await uploadReferenceImage(page, uploadPath, 0);

    const chip = ingredientChips(page).first();
    await chip.waitFor({ state: 'visible', timeout: UPLOAD_TIMEOUT_MS }).catch(() => {
      throw new AppError(`Flow did not attach ingredient ${uploadName}`, 502, 'FLOW_INGREDIENT_NOT_SET');
    });
    for (let waited = 0; (await chip.getAttribute('aria-busy')) === 'true' && waited < UPLOAD_TIMEOUT_MS; waited += 1_000) {
      await sleep(1_000);
    }
    await page.keyboard.press('Escape').catch(() => undefined);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function typePrompt(page: Page, prompt: string): Promise<void> {
  const box = page.getByRole('textbox', { name: 'What do you want to create?' });
  await box.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.insertText(prompt.replace(/\s+/g, ' ').trim());
  await sleep(400);
}

/** Lower-case, single-spaced, for comparing prompts as Flow shows them. */
function normalizePrompt(text: string): string {
  return text.replace(/s+/g, ' ').trim().toLowerCase();
}

/** Each generation is one batch in the media list, newest first: tiles + prompt + ingredients. */
function newestBatch(page: Page): Locator {
  return page.locator('.batch-container').first();
}

async function batchPrompt(batch: Locator): Promise<string> {
  return normalizePrompt(await batch.locator('flow-batch-info .prompt-text').first().innerText({ timeout: 2_000 }).catch(() => ''));
}

async function scrollMediaToTop(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      for (const el of document.querySelectorAll('.virtual-scroll-container, cdk-virtual-scroll-viewport')) {
        let node: HTMLElement | null = el as HTMLElement;
        while (node) {
          if (node.scrollTop > 0) node.scrollTop = 0;
          node = node.parentElement;
        }
      }
    })
    .catch(() => undefined);
}

type BatchState = { kind: 'pending' } | { kind: 'done' } | { kind: 'error'; text: string };

async function batchState(batch: Locator): Promise<BatchState> {
  const errorTile = batch.locator(FLOW_CONFIG.selectors.flowErrorTile).first();
  if (await errorTile.isVisible().catch(() => false)) {
    return { kind: 'error', text: (await errorTile.innerText().catch(() => '')).trim() || 'unknown flow-error-tile' };
  }
  const tiles = (await batch.locator('.batch-tiles-section').innerText({ timeout: 2_000 }).catch(() => '')).replace(/s+/g, ' ');
  if (/fail|couldn.t|unable|went wrong|violat|policy/i.test(tiles)) return { kind: 'error', text: tiles.trim() };
  // A rendering tile shows its progress as text (e.g. "41%").
  if (/d{1,3}%/.test(tiles)) return { kind: 'pending' };
  const thumbnail = await batch.locator('flow-video-tile img.thumbnail').first().getAttribute('src', { timeout: 2_000 }).catch(() => null);
  return thumbnail ? { kind: 'done' } : { kind: 'pending' };
}

/** Saves the batch's video: its Download button (original file), else the hover-preview stream. */
async function downloadBatchVideo(page: Page, batch: Locator, outputPath: string): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  try {
    await batch.hover();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      batch.getByRole('button', { name: 'Download' }).first().click(),
    ]);
    await download.saveAs(outputPath);
    const size = (await fs.stat(outputPath)).size;
    if (size > 50_000) return;
    emitDetailLog(`[flow-video-ui] Download button gave ${size} bytes, using the preview stream`);
  } catch (err) {
    emitDetailLog(`[flow-video-ui] Download button failed (${err instanceof Error ? err.message : String(err)}), using the preview stream`);
  }
  await page.keyboard.press('Escape').catch(() => undefined);
  const tile = batch.locator('flow-video-tile').first();
  await tile.hover();
  const video = tile.locator('video').first();
  await video.waitFor({ state: 'attached', timeout: 15_000 });
  const src = await video.evaluate(el => (el as HTMLVideoElement).currentSrc || (el as HTMLVideoElement).src);
  if (!src) throw new AppError('Flow video tile has no source', 502, 'FLOW_VIDEO_DOWNLOAD_FAILED');
  await downloadFlowVideo(page, src, outputPath);
}

async function alertText(page: Page): Promise<string> {
  const texts = await page
    .locator('.mat-mdc-snack-bar-container, [role=alert], mat-dialog-container')
    .allInnerTexts()
    .catch(() => []);
  return texts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Attaches the image as ingredient and fills the prompt, leaving the clip ready to generate. */
export async function prepareFlowClipViaUi(
  page: Page,
  job: { name: string; imagePath: string; prompt: string },
  uploadTag: string,
): Promise<void> {
  await attachIngredient(page, job.imagePath, `${uploadTag}-${job.name}${path.extname(job.imagePath) || '.jpg'}`);
  await typePrompt(page, job.prompt);
}

/**
 * Submits one clip and waits for its video. A credits/limit message is a quota error (switch
 * profile); an error tile is classified like image tiles; anything else fails just this clip.
 */
export async function generateFlowClipViaUi(
  page: Page,
  job: { name: string; imagePath: string; prompt: string },
  outputPath: string,
  options: { uploadTag: string; timeoutMs?: number },
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? FLOW_VIDEO_CLIP_TIMEOUT_MS;
  await scrollMediaToTop(page);
  const batchesBefore = await page.locator('.batch-container').count();
  const promptBefore = await batchPrompt(newestBatch(page));
  // Flow clamps the shown prompt; the first words are enough to recognise our batch.
  const wanted = normalizePrompt(job.prompt).slice(0, 60);

  await prepareFlowClipViaUi(page, job, options.uploadTag);

  const generate = page.getByRole('button', { name: 'Start generation' });
  if (!(await generate.isEnabled())) {
    throw new AppError('Flow generate button is disabled', 502, 'FLOW_GENERATE_DISABLED');
  }
  await generate.click();
  emitDetailLog(`[flow-video-ui] submitted ${job.name}`);

  const deadline = Date.now() + timeoutMs;
  let found = false;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);

    const alert = await alertText(page);
    if (/credit|limit|quota/i.test(alert)) throw createFlowDailyQuotaError(alert);

    await scrollMediaToTop(page);
    const batch = newestBatch(page);
    if (!found) {
      const prompt = await batchPrompt(batch);
      const isNew = (await page.locator('.batch-container').count()) > batchesBefore || prompt !== promptBefore;
      if (!isNew || !prompt || !prompt.startsWith(wanted.slice(0, Math.min(wanted.length, prompt.length)))) continue;
      found = true;
      emitDetailLog(`[flow-video-ui] ${job.name}: batch appeared, rendering...`);
    }

    const state = await batchState(batch);
    if (state.kind === 'error') throw appErrorFromFlowErrorTileText(state.text);
    if (state.kind === 'done') {
      await downloadBatchVideo(page, batch, outputPath);
      return;
    }
  }
  throw new AppError(
    `Flow: no video for ${job.name} after ${Math.round(timeoutMs / 1000)}s${found ? '' : ' (its batch never appeared)'}`,
    504,
    'FLOW_VIDEO_TIMEOUT',
  );
}
