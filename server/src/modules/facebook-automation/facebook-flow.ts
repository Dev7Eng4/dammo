import fs from 'node:fs';
import type { Locator, Page } from 'playwright';
import { clearContent, clickElement, delay } from '../youtube-upload/studio-dom.js';
import { AppError } from '../../shared/http/errors.js';
import {
  FACEBOOK_SELECTOR,
  FACEBOOK_URL,
  type SelectorList,
} from './facebook-selectors.js';

const DEFAULT_WAIT_MS = 15_000;

/** Returns a locator for the first selector in the list that is visible within the timeout. */
export async function waitForAnyVisible(
  page: Page,
  selectors: SelectorList,
  timeoutMs = DEFAULT_WAIT_MS,
): Promise<Locator | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      if (await locator.isVisible().catch(() => false)) return locator;
    }
    await delay(250, 400);
  }
  return null;
}

async function requireVisible(page: Page, selectors: SelectorList, what: string, timeoutMs?: number): Promise<Locator> {
  const locator = await waitForAnyVisible(page, selectors, timeoutMs);
  if (!locator) {
    throw new AppError(`Facebook element not found: ${what}`, 502, 'FACEBOOK_SELECTOR_MISSING', {
      what,
      url: page.url(),
    });
  }
  return locator;
}

async function dismissPopups(page: Page): Promise<void> {
  for (const selector of FACEBOOK_SELECTOR.dismissButtons) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      await clickElement(page, locator).catch(() => undefined);
      await delay(300, 500);
    }
  }
}

async function gotoFacebook(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await delay(1500, 2500);
  if (/\/login|checkpoint/.test(page.url())) {
    throw new AppError('Facebook profile is not logged in (or hit a checkpoint)', 401, 'FACEBOOK_NOT_LOGGED_IN');
  }
  await dismissPopups(page);
}

async function typeInto(page: Page, locator: Locator, text: string): Promise<void> {
  await clickElement(page, locator);
  await clearContent(page);
  await page.keyboard.insertText(text);
  await delay(200, 400);
}

export interface CreatePageInput {
  name: string;
  category: string;
  bio: string;
}

/** Creates a Facebook Page and returns its URL. */
export async function createFacebookPage(page: Page, input: CreatePageInput): Promise<string> {
  await gotoFacebook(page, FACEBOOK_URL.createPage);

  await typeInto(page, await requireVisible(page, FACEBOOK_SELECTOR.pageNameInput, 'page name input'), input.name);

  const categoryInput = await requireVisible(page, FACEBOOK_SELECTOR.pageCategoryInput, 'category input');
  await typeInto(page, categoryInput, input.category);
  const option = await requireVisible(page, FACEBOOK_SELECTOR.pageCategoryOption, 'category suggestion');
  await clickElement(page, option);
  await delay(400, 700);

  if (input.bio) {
    const bio = await waitForAnyVisible(page, FACEBOOK_SELECTOR.pageBioInput, 3_000);
    if (bio) await typeInto(page, bio, input.bio);
  }

  await clickElement(page, await requireVisible(page, FACEBOOK_SELECTOR.createPageButton, 'create page button'));
  await delay(4000, 6000);
  await dismissPopups(page);

  await requireVisible(page, FACEBOOK_SELECTOR.pageCreatedMarker, 'page created confirmation', 30_000);
  return page.url();
}

/** Opens the page and, if Facebook offers it, switches the acting identity to the page. */
export async function openPageAsPage(page: Page, pageUrl: string): Promise<void> {
  await gotoFacebook(page, pageUrl);
  const switchNow = await waitForAnyVisible(page, FACEBOOK_SELECTOR.switchNowButton, 4_000);
  if (switchNow) {
    await clickElement(page, switchNow);
    await delay(2500, 4000);
  }
}

export interface PostInput {
  text: string;
  imagePath?: string;
}

export async function publishPagePost(page: Page, pageUrl: string, input: PostInput): Promise<void> {
  await openPageAsPage(page, pageUrl);

  await clickElement(page, await requireVisible(page, FACEBOOK_SELECTOR.composerOpen, 'composer opener'));
  await requireVisible(page, FACEBOOK_SELECTOR.composerDialog, 'composer dialog');

  await typeInto(page, await requireVisible(page, FACEBOOK_SELECTOR.composerTextbox, 'composer textbox'), input.text);

  if (input.imagePath) {
    if (!fs.existsSync(input.imagePath)) {
      throw new AppError('Image file not found', 400, 'FILE_NOT_FOUND');
    }
    // File inputs are hidden; Playwright sets files without needing visibility.
    const fileInput = page.locator(FACEBOOK_SELECTOR.composerPhotoVideoInput.join(', ')).first();
    await fileInput.setInputFiles(input.imagePath);
    await delay(3000, 5000);
  }

  await clickElement(page, await requireVisible(page, FACEBOOK_SELECTOR.composerPostButton, 'post button'));
  await delay(4000, 6000);
}

export interface ReelInput {
  videoPath: string;
  caption: string;
}

export async function publishReel(page: Page, pageUrl: string, input: ReelInput): Promise<void> {
  if (!fs.existsSync(input.videoPath)) {
    throw new AppError('Video file not found', 400, 'FILE_NOT_FOUND');
  }

  await openPageAsPage(page, pageUrl);
  await gotoFacebook(page, FACEBOOK_URL.createReel);

  const fileInput = page.locator(FACEBOOK_SELECTOR.reelFileInput.join(', ')).first();
  await fileInput.waitFor({ state: 'attached', timeout: DEFAULT_WAIT_MS });
  await fileInput.setInputFiles(input.videoPath);
  await delay(4000, 6000);

  // Reel creation has two "Next" steps (edit, then details) before Publish.
  for (let step = 0; step < 2; step += 1) {
    const next = await waitForAnyVisible(page, FACEBOOK_SELECTOR.reelNextButton, 20_000);
    if (!next) break;
    await clickElement(page, next);
    await delay(1500, 2500);
  }

  if (input.caption) {
    const description = await requireVisible(page, FACEBOOK_SELECTOR.reelDescriptionTextbox, 'reel description');
    await typeInto(page, description, input.caption);
  }

  await clickElement(page, await requireVisible(page, FACEBOOK_SELECTOR.reelPublishButton, 'publish button', 30_000));
  await delay(5000, 8000);
}
