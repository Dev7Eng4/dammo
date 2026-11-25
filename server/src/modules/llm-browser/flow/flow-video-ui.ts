import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { createFlowDailyQuotaError } from './api/flow-api-errors.js';
import { downloadFlowVideo } from './api/flow-video.client.js';
import { pollFlowGridVideo, snapshotFlowGridVideos } from './flow-grid-dom.js';
import { uploadReferenceImage } from './flow.provider.js';
import { paths } from '../../../config/paths.js';
import { AppError } from '../../../shared/http/errors.js';
import { emitDetailLog } from '../../video-production/shared/video-log.js';

/**
 * Image → video through the flow.google.com UI (the old labs.google token endpoint answers 410).
 *
 * Prompt-bar settings popover: Video · Ingredients · aspect · model · 360p · x1, the Length slider per clip, then the scene image is
 * attached as the only ingredient (+ → Upload media → asset → Add to prompt, as for image references).
 */

export const FLOW_VIDEO_DEFAULT_MODEL = 'Omni 1.2 Flash';
export type FlowVideoAspectRatio = '16:9' | '9:16';
export type FlowVideoResolution = '360p' | '720p';
export const FLOW_VIDEO_DEFAULT_RESOLUTION: FlowVideoResolution = '360p';

export interface FlowVideoUiSettings {
  model: string;
  aspectRatio: FlowVideoAspectRatio;
  /** Default 360p; skipped when the chosen model has no resolution toggle. */
  resolution?: FlowVideoResolution;
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
  // Resolution toggle shows only for some models (e.g. Omni); its label may carry an info icon.
  const resolution = settings.resolution ?? FLOW_VIDEO_DEFAULT_RESOLUTION;
  const resolutionToggle = overlay(page).getByRole('radio', { name: new RegExp(`^\\s*${resolution}`) }).first();
  if (await resolutionToggle.isVisible().catch(() => false)) {
    await pickToggle(page, new RegExp(`^\\s*${resolution}`));
    await sleep(600);
  } else {
    emitDetailLog(`[flow-video-ui] no ${resolution} option for ${settings.model}, keeping Flow's default resolution`);
  }

  // Length is set per clip (setFlowVideoLength); clips without a length keep Flow's slider as is.
  await pickToggle(page, /^x1$/);
  if (options.keepOpen) {
    emitDetailLog(`[flow-video-ui] settings picked (popover left open): Video · Ingredients · ${settings.aspectRatio} · ${settings.model} · ${resolution} · x1`);
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

/** Seconds shown next to the Length slider ("5 Sec"), or null when not found. */
async function shownLengthSec(page: Page): Promise<number | null> {
  const text = await overlay(page).getByText(/^\s*\d+\s*Sec\s*$/).first().innerText().catch(() => '');
  const match = /(\d+)/.exec(text);
  return match ? Number(match[1]) : null;
}

async function sliderNumber(slider: Locator, names: string[]): Promise<number | null> {
  for (const name of names) {
    const raw = await slider.getAttribute(name).catch(() => null);
    if (raw !== null && raw.trim() !== '' && Number.isFinite(Number(raw))) return Number(raw);
  }
  return null;
}

const LENGTH_ATTEMPTS = 3;
/** Screenshots of the Length popover, so a wrong clip length can be traced without the server console. */
const LENGTH_DEBUG_DIR = path.join(paths.dataDir, 'flow-debug');
const LENGTH_DEBUG_KEEP = 30;

async function openLengthSlider(page: Page): Promise<Locator> {
  await settingsTrigger(page).click();
  const slider = overlay(page).locator('input[type="range"], [role="slider"]').first();
  await slider.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {
    throw new AppError('Flow Length slider not found in the settings popover', 502, 'FLOW_LENGTH_SLIDER_NOT_FOUND');
  });
  await sleep(600);
  return slider;
}

async function closeSettings(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await sleep(800);
}

async function saveLengthShot(page: Page, name: string): Promise<void> {
  try {
    await fs.mkdir(LENGTH_DEBUG_DIR, { recursive: true });
    await page.screenshot({ path: path.join(LENGTH_DEBUG_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}-${name}.png`) });
    const files = (await fs.readdir(LENGTH_DEBUG_DIR)).filter(file => file.endsWith('.png')).sort();
    for (const old of files.slice(0, Math.max(0, files.length - LENGTH_DEBUG_KEEP))) await fs.rm(path.join(LENGTH_DEBUG_DIR, old), { force: true });
  } catch {
    // debug only
  }
}

interface LengthState {
  /** Seconds in the "N Sec" label. */
  sec: number;
  /** The slider input's own value: a step index (0 = shortest), not seconds. */
  index: number;
  minSec: number;
  maxSec: number;
}

/**
 * Length as Flow holds it, read from a freshly opened popover. The slider input counts steps
 * (min="0" max="7" for 3–10 s), so seconds come from the "N Sec" label and the input's index range is
 * turned into seconds with the label's offset.
 */
async function readCommittedLength(page: Page, shot: string): Promise<LengthState> {
  const slider = await openLengthSlider(page);
  const raw = (await slider.inputValue().catch(() => '')).trim();
  const index = raw === '' ? Number.NaN : Number(raw);
  const sec = await shownLengthSec(page);
  const min = (await sliderNumber(slider, ['min', 'aria-valuemin'])) ?? 0;
  const max = (await sliderNumber(slider, ['max', 'aria-valuemax'])) ?? min;
  await saveLengthShot(page, shot);
  await closeSettings(page);
  if (sec === null || !Number.isFinite(index)) {
    throw new AppError(`Flow Length slider unreadable (label ${sec ?? '?'} Sec, input ${Number.isFinite(index) ? index : '?'})`, 502, 'FLOW_LENGTH_SLIDER_NOT_FOUND');
  }
  const offset = sec - index;
  return { sec, index, minSec: min + offset, maxSec: max + offset };
}

/**
 * Sets the clip Length slider and returns the seconds Flow will use. The slider input is focused and
 * moved with the arrow keys (one step = one second), blurred so Flow takes the value, the popover is
 * closed, and the length is read back from a freshly opened popover. Retries up to three times and
 * throws when the length never matches, so no clip is made at a wrong length. Screenshots of every
 * read go to data/flow-debug/.
 */
export async function setFlowVideoLength(page: Page, wantedSec: number): Promise<number> {
  let state = await readCommittedLength(page, `length-before-${Math.round(wantedSec)}s`);
  const target = Math.max(state.minSec, Math.min(state.maxSec, Math.round(wantedSec)));
  for (let attempt = 1; attempt <= LENGTH_ATTEMPTS && state.sec !== target; attempt += 1) {
    const slider = await openLengthSlider(page);
    const steps = target - state.sec;
    await slider.focus();
    await sleep(300);
    for (let step = 0; step < Math.abs(steps); step += 1) {
      await page.keyboard.press(steps > 0 ? 'ArrowRight' : 'ArrowLeft');
      await sleep(350);
    }
    await sleep(1_000);
    await page.keyboard.press('Tab');
    await sleep(500);
    await closeSettings(page);
    const before = state.sec;
    state = await readCommittedLength(page, `length-try${attempt}-${target}s`);
    emitDetailLog(`[flow-video-ui] length try ${attempt}: ${before}s → ${state.sec}s (wanted ${target}s, slider ${state.minSec}–${state.maxSec}s)`);
  }
  if (state.sec !== target) {
    throw new AppError(`Flow Length is ${state.sec}s, wanted ${target}s`, 502, 'FLOW_LENGTH_NOT_SET');
  }
  emitDetailLog(`[flow-video-ui] length ${target}s`);
  return target;
}

/**
 * For checking the Length slider by eye: what the settings popover holds around "Length" (outerHTML of
 * its block, every range input / slider role with its attributes and box). Read-only.
 */
export async function describeFlowLengthSlider(page: Page): Promise<string> {
  return page.evaluate(() => {
    const root = document.querySelector('.cdk-overlay-container') ?? document.body;
    const label = [...root.querySelectorAll('*')].find(el => el.children.length === 0 && el.textContent?.trim() === 'Length');
    let block: Element | null | undefined = label;
    for (let up = 0; block && up < 4; up += 1) block = block.parentElement;
    const sliders = [...root.querySelectorAll('input[type="range"], [role="slider"]')].map(el => {
      const box = el.getBoundingClientRect();
      const attrs = [...el.attributes].map(attr => `${attr.name}="${attr.value}"`).join(' ');
      return `<${el.tagName.toLowerCase()} ${attrs}> box=${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)}`;
    });
    return [
      `sliders (${sliders.length}):`,
      ...sliders,
      '--- Length block ---',
      (block?.outerHTML ?? '(no "Length" label found)').slice(0, 6000),
    ].join('\n');
  });
}

/** Opens the settings popover and leaves it open (for a person to check the settings). */
export async function openFlowVideoSettingsPopover(page: Page): Promise<void> {
  await settingsTrigger(page).click();
  await sleep(800);
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
 * Submits one clip and waits for its video. The project grid is snapshotted first; the clip is done
 * when a `<video>` tile with a new `/asb/` src appears, and that src is downloaded as the mp4.
 * A credits/limit message is a quota error (switch profile); a new error tile on top is classified
 * like image tiles; anything else fails just this clip.
 */
export async function generateFlowClipViaUi(
  page: Page,
  job: { name: string; imagePath: string; prompt: string },
  outputPath: string,
  options: { uploadTag: string; timeoutMs?: number },
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? FLOW_VIDEO_CLIP_TIMEOUT_MS;

  await prepareFlowClipViaUi(page, job, options.uploadTag);
  // After the ingredient upload (it adds an image tile on top), before submit.
  const snapshot = await snapshotFlowGridVideos(page);

  const generate = page.getByRole('button', { name: 'Start generation' });
  if (!(await generate.isEnabled())) {
    throw new AppError('Flow generate button is disabled', 502, 'FLOW_GENERATE_DISABLED');
  }
  await generate.click();
  emitDetailLog(`[flow-video-ui] submitted ${job.name} (grid had ${snapshot.videoKeys.size} video(s))`);

  const deadline = Date.now() + timeoutMs;
  let lastDownloadError = '';
  while (Date.now() < deadline) {
    await sleep(POLL_MS);

    const alert = await alertText(page);
    if (/credit|limit|quota/i.test(alert)) throw createFlowDailyQuotaError(alert);

    const state = await pollFlowGridVideo(page, snapshot);
    if (state.kind === 'error') throw state.error;
    if (state.kind === 'pending') continue;

    try {
      emitDetailLog(`[flow-video-ui] ${job.name}: video src ${state.src.slice(0, 80)}...`);
      await downloadFlowVideo(page, state.src, outputPath);
      return;
    } catch (err) {
      // The tile can show its src a moment before the file is served; keep polling until the deadline.
      lastDownloadError = err instanceof Error ? err.message : String(err);
      emitDetailLog(`[flow-video-ui] ${job.name}: download not ready (${lastDownloadError}), retrying`);
    }
  }
  throw new AppError(
    `Flow: no video for ${job.name} after ${Math.round(timeoutMs / 1000)}s` +
      (lastDownloadError ? ` (last download error: ${lastDownloadError})` : ' (no new video tile appeared)'),
    504,
    'FLOW_VIDEO_TIMEOUT',
  );
}
