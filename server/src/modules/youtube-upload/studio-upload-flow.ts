import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Page } from 'playwright';
import { humanScroll, randomInt } from '../../infrastructure/llm-browser/human-interaction.js';
import { parseVideoMetaContent } from '../video-production/shared/meta/metadata.types.js';
import { clickElement, clearContent, delay, scrollUntilVisible } from './studio-dom.js';
import { YOUTUBE_SELECTOR } from './studio-selectors.js';
import { findThumbnailPath } from './upload-assets.js';

const RELATED_VIDEO_START_OFFSET_SEC = 17;
const VIDEO_META_FILENAME = 'video-meta.json';

function getVideoDurationSeconds(mp4Path: string): number | null {
  if (!mp4Path || !fs.existsSync(mp4Path)) return null;
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', mp4Path],
      { encoding: 'utf-8' },
    ).trim();
    const n = parseFloat(out);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function relatedVideoStartSecondsFromDuration(durationSeconds: number, offsetSec = RELATED_VIDEO_START_OFFSET_SEC): number {
  return Math.max(0, Math.floor(Number(durationSeconds)) - offsetSec);
}

export function formatYoutubeRelatedStartStamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(Number(totalSeconds)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const ss = String(sec).padStart(2, '0');
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${ss}:00`;
  }
  return `${m}:${ss}:00`;
}

export function formatRelatedVideoStartFromDuration(durationSeconds: number): string {
  return formatYoutubeRelatedStartStamp(relatedVideoStartSecondsFromDuration(durationSeconds));
}

function readVideoMeta(videoFolderPath: string) {
  const metaPath = path.join(videoFolderPath, VIDEO_META_FILENAME);
  if (!fs.existsSync(metaPath)) {
    console.warn(`[youtube-upload] Missing ${metaPath}`);
    return null;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as unknown;
    return parseVideoMetaContent(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[youtube-upload] Failed to read video-meta.json: ${message}`);
    return null;
  }
}

function formatTags(tags: unknown): string {
  if (!Array.isArray(tags)) return '';
  return tags
    .map(tag => String(tag ?? '').trim())
    .filter(Boolean)
    .join(', ');
}

export async function openYoutubeUpload(page: Page, mp4Path: string): Promise<void> {
  await page.goto('https://www.youtube.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 });

  try {
    await page.keyboard.press('Escape');
  } catch {
    /* ignore */
  }

  await delay(800, 1000);
  await page.keyboard.press('F11');
  await clickElement(page, YOUTUBE_SELECTOR.btnCreate);
  await delay(300, 500);
  await clickElement(page, YOUTUBE_SELECTOR.btnUploadVideo);
  await selectFile(page, mp4Path);
}

export async function selectFile(page: Page, mp4Path: string): Promise<void> {
  await delay(4000);

  const session = await page.context().newCDPSession(page);
  const btnLoc = page.locator(YOUTUBE_SELECTOR.btnSelectFile);
  await btnLoc.hover();
  await page.mouse.move(randomInt(50, 100), randomInt(100, 300), { steps: 20 });
  await delay(2000);

  const { root } = await session.send('DOM.getDocument', { depth: 0 });
  const { nodeId } = await session.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: 'input[type="file"]',
  });

  await session.send('DOM.setFileInputFiles', {
    nodeId,
    files: [mp4Path],
  });

  console.log(`[youtube-upload] Set file via CDP: ${mp4Path}`);
  await delay(500, 800);

  try {
    await page.waitForSelector(YOUTUBE_SELECTOR.formDetails, {
      state: 'attached',
      timeout: 15_000,
    });
  } catch {
    /* form may already be visible */
  }
}

export async function fillVideoDetails(
  page: Page,
  videoFolderPath: string,
  onError?: (message: string) => void,
  thumbnailPath?: string,
): Promise<void> {
  const meta = readVideoMeta(videoFolderPath);
  const title = typeof meta?.metadata.title === 'string' ? meta.metadata.title.trim() : '';
  const description = typeof meta?.metadata.description === 'string' ? meta.metadata.description.trim() : '';
  const tags = formatTags(meta?.metadata.tags);

  await page.waitForTimeout(randomInt(150, 250));

  if (title) {
    await clickElement(page, YOUTUBE_SELECTOR.titleBox);
    await clearContent(page);
    await page.keyboard.insertText(title);
  } else {
    onError?.(`Missing title in video-meta.json: ${videoFolderPath}`);
  }

  await delay(200, 300);

  if (description) {
    await clickElement(page, YOUTUBE_SELECTOR.descriptionBox);
    await clearContent(page);
    await page.keyboard.insertText(description);
  } else {
    onError?.(`Missing description in video-meta.json: ${videoFolderPath}`);
  }

  try {
    // await page.keyboard.press('Escape');
    await delay(200);
  } catch {
    /* ignore */
  }

  await delay(200, 300);

  const boxUpload = await page.locator(YOUTUBE_SELECTOR.boxUpload).boundingBox();
  if (boxUpload) {
    await page.mouse.move(
      boxUpload.x + boxUpload.width / 2 + (Math.random() * 20 - 10),
      boxUpload.y + boxUpload.height / 2 + (Math.random() * 20 - 10),
    );
  }

  await scrollUntilVisible(page, YOUTUBE_SELECTOR.thumbnailBox, false, 50);
  await delay(200, 500);

  const resolvedThumbnailPath = thumbnailPath ?? findThumbnailPath(videoFolderPath);
  if (resolvedThumbnailPath && fs.existsSync(resolvedThumbnailPath)) {
    const [fileChooser] = await Promise.all([page.waitForEvent('filechooser'), clickElement(page, YOUTUBE_SELECTOR.btnSelectThumbnail)]);
    await delay(1000);
    await fileChooser.setFiles(resolvedThumbnailPath);
  } else {
    onError?.(`Missing thumbnail (thumbnail.*): ${videoFolderPath}`);
  }

  try {
    await delay(200, 300);

    const playlistBox = await page.locator(YOUTUBE_SELECTOR.boxPlaylist).boundingBox();
    if (playlistBox) {
      await page.mouse.move(
        playlistBox.x + playlistBox.width / 2 + (Math.random() * 20 - 10),
        playlistBox.y + playlistBox.height / 2 + (Math.random() * 20 - 10),
      );
    }

    await clickElement(page, YOUTUBE_SELECTOR.boxPlaylist);

    await delay(200, 300);

    await delay(200, 300);
    try {
      await clickElement(page, YOUTUBE_SELECTOR.playlistFirstItem);
    } catch {
      /* playlist may be empty */
    }
    await delay(200, 300);
    await clickElement(page, YOUTUBE_SELECTOR.playlistClose);
  } catch {
    /* ignore */
  }

  await delay(200);

  const box = await page.locator(YOUTUBE_SELECTOR.boxUpload).boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2 + (Math.random() * 20 - 10), box.y + box.height / 2 + (Math.random() * 20 - 10));
    for (let i = 0; i < 10; i += 1) {
      await page.mouse.wheel(0, 200 + Math.random() * 100);
      await page.waitForTimeout(100 + Math.random() * 200);
    }
  }

  await delay(200);
  await clickElement(page, YOUTUBE_SELECTOR.btnShowMore);
  await delay(200);

  if (tags) {
    await scrollUntilVisible(page, YOUTUBE_SELECTOR.tagsBox, false, 100);
    await clickElement(page, YOUTUBE_SELECTOR.tagsInput);
    await delay(200);
    await page.keyboard.insertText(tags);
  } else {
    onError?.(`Missing tags in video-meta.json: ${videoFolderPath}`);
  }

  await delay(300, 500);
  await clickElement(page, YOUTUBE_SELECTOR.btnNextToRelatedStep);
}

export async function addRelatedVideo(page: Page, mp4Path?: string, onError?: (message: string) => void): Promise<void> {
  await delay(300, 300);
  await clickElement(page, YOUTUBE_SELECTOR.btnAddVideoRelated);
  await delay(2000);

  try {
    await page.waitForSelector(YOUTUBE_SELECTOR.boxChooseTemplate, {
      state: 'visible',
      timeout: 3000,
    });
    await delay(200, 300);
    await clickElement(page, YOUTUBE_SELECTOR.btnSpecificTemplate);
  } catch {
    onError?.('Could not find end screen template picker');
  }

  await delay(200, 300);
  await clickElement(page, YOUTUBE_SELECTOR.btnSelectElement);
  await clickElement(page, YOUTUBE_SELECTOR.btnSelectVideo);
  await delay(300, 500);

  if (mp4Path) {
    const dur = getVideoDurationSeconds(mp4Path);
    if (dur != null) {
      const stamp = formatRelatedVideoStartFromDuration(dur);
      const elementsTimeline = page.locator(YOUTUBE_SELECTOR.elementTimeline);

      try {
        for (let i = 0; i < 3; i += 1) {
          const ele = elementsTimeline.nth(i);
          await clickElement(page, ele, false, true);
          await delay(300, 500);
          await clickElement(page, YOUTUBE_SELECTOR.startTime);
          await delay(400, 500);
          await page.keyboard.down('Control');
          await page.keyboard.press('a');
          await page.keyboard.up('Control');
          await page.waitForTimeout(300);
          await page.keyboard.insertText(stamp);
          await page.keyboard.press('Enter');
          await delay(200, 300);
        }
      } catch {
        /* non-fatal */
      }
    } else {
      console.warn(`[youtube-upload] Could not read duration — skip start time: ${mp4Path}`);
    }
  }

  await delay(200, 300);
  await clickElement(page, YOUTUBE_SELECTOR.btnSaveRelatedVideo);

  try {
    await page.waitForSelector(YOUTUBE_SELECTOR.boxEditDetailEndScreen, {
      state: 'detached',
      timeout: 3000,
    });
  } catch {
    onError?.('End screen editor did not close');
  }

  await delay(500);
  await clickElement(page, YOUTUBE_SELECTOR.btnNextToCheckStep);
  await delay(200, 200);
  await clickElement(page, YOUTUBE_SELECTOR.btnNextToVisibilityStep);
}

export interface PublishScheduleSlot {
  date: string;
  time: string;
  iso?: string;
}

export async function chooseVisibility(page: Page, ctx: { slot?: PublishScheduleSlot | null }): Promise<void> {
  const slot = ctx?.slot;

  const boxUpload = await page.locator(YOUTUBE_SELECTOR.boxUpload).boundingBox();
  if (boxUpload) {
    await page.mouse.move(
      boxUpload.x + boxUpload.width / 2 + (Math.random() * 20 - 10),
      boxUpload.y + boxUpload.height / 2 + (Math.random() * 20 - 10),
    );
  }

  await humanScroll(page, 140);

  if (slot?.date && slot?.time) {
    await clickElement(page, YOUTUBE_SELECTOR.btnChooseSchedule);
    await delay(200, 500);
    await clickElement(page, YOUTUBE_SELECTOR.btnSelectDate);
    await delay(300, 500);
    await clickElement(page, YOUTUBE_SELECTOR.inputDate);
    await clearContent(page);
    await delay(200, 500);
    await page.keyboard.insertText(slot.date);
    await delay(300, 500);
    await page.keyboard.press('Enter');
    // await page.keyboard.press('Escape');

    await delay(300, 500);
    await clickElement(page, YOUTUBE_SELECTOR.inputTime);
    await clearContent(page);
    await delay(200, 500);
    await page.keyboard.insertText(slot.time);
    await delay(200, 300);
    await page.keyboard.press('Enter');
  }

  let isUploading = true;
  try {
    const progressUploadEle = page.locator(YOUTUBE_SELECTOR.progressUploadLabel);
    while (isUploading) {
      const txt = await progressUploadEle.innerText();
      if (!txt.toUpperCase().includes('UPLOADING')) {
        isUploading = false;
      }
      await delay(1000);
    }
  } catch {
    isUploading = false;
  }

  await clickElement(page, YOUTUBE_SELECTOR.btnSaveSchedule);
  await delay(2000, 100);

  try {
    await page.waitForSelector(YOUTUBE_SELECTOR.popupWarning, {
      state: 'visible',
      timeout: 4000,
    });
    await clickElement(page, YOUTUBE_SELECTOR.btnGotItWarning);
  } catch {
    console.log('[youtube-upload] No precheck warning popup.');
  }

  await delay(1000, 200);
  await page.reload({ timeout: 30_000 });
}
