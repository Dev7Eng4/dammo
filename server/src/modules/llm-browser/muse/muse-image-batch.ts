import type { Page } from 'playwright';
import { AppError, isAppError } from '../../../shared/http/errors.js';
import { randomDelay } from '../../../infrastructure/browser/human-interaction.js';
import { appSettingsService } from '../../app-settings/app-settings.service.js';
import {
  closeChromeProfiles,
  createChromeProfileWindow,
  getChromeProfilePage,
  openChromeProfile,
} from '../../chrome-profiles/chrome-profile.runner.js';
import { chromeProfilesService } from '../../chrome-profiles/chrome-profiles.service.js';
import type { ChromeProfile } from '../../chrome-profiles/chrome-profiles.types.js';
import { getMuseBrowserHandler } from '../core/registry.js';
import { MUSE_BASE_URL } from './muse.config.js';
import { museBrowserService } from './muse.service.js';

/** One image to make: saved as `${outputDir}/${fileName}` (always written as .jpg). */
export interface MuseImageBatchJob {
  /** Log / progress key (e.g. scene-001). */
  id: string;
  prompt: string;
  outputDir: string;
  fileName: string;
  referenceImagePaths?: string[];
  aspectRatio?: '16:9' | '3:4';
  skipResize?: boolean;
}

export interface MuseImageBatchJobResult {
  id: string;
  ok: boolean;
  localPath?: string;
  error?: string;
}

export interface MuseImageBatchOptions {
  /** Tabs (windows) per Muse profile. Default: the app's Meta tabs-per-profile setting (3). */
  tabsPerProfile?: number;
  /** Tries per image, each in a new side chat. Default 3. */
  maxAttempts?: number;
  onLog?: (msg: string) => void;
  onJobProgress?: (progress: { jobId: string; index: number; total: number; status: 'generating' | 'done' | 'failed' }) => void;
}

export interface MuseImageBatchResult {
  results: MuseImageBatchJobResult[];
  generatedCount: number;
  failedCount: number;
}

interface MuseWorker {
  label: string;
  profileId: string;
  page: Page;
}

/** Muse's image service is down: wait this long (times the try) before handing the image out again. */
const SERVICE_DOWN_WAIT_MS = 60_000;
/** Tabs start a little apart so three side chats are not created in the same second. */
const TAB_START_GAP_MS: [number, number] = [2_000, 5_000];

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Make many images with Muse at once: every Chrome profile with Muse ticked in LLM Image opens
 * `tabsPerProfile` windows, and each window takes the next image from a shared queue (a new side chat per
 * image). A failed image goes back to the queue until it has used `maxAttempts`; a profile that is not
 * logged into muse.ai drops out and its image goes back too.
 */
export async function generateImagesWithMuse(
  jobs: MuseImageBatchJob[],
  options: MuseImageBatchOptions = {},
): Promise<MuseImageBatchResult> {
  const log = options.onLog ?? ((msg: string) => console.log(msg));
  const results: MuseImageBatchJobResult[] = jobs.map(job => ({ id: job.id, ok: false }));
  if (jobs.length === 0) return { results, generatedCount: 0, failedCount: 0 };

  const profiles = chromeProfilesService.listProfilesForLlm('image', 'muse');
  if (profiles.length === 0) {
    throw new AppError(
      'No Chrome profile has Muse selected in LLM Image. Tick it on the Chrome profiles screen for a profile logged into muse.ai.',
      409,
      'NO_LLM_PROFILE',
    );
  }
  const tabsPerProfile = Math.max(1, options.tabsPerProfile ?? appSettingsService.get().metaTabsPerProfile);
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);

  const queue: number[] = jobs.map((_, index) => index);
  const attempts = jobs.map(() => 0);
  const loggedOut = new Set<string>();
  const openedProfileIds = new Set<string>();
  let serviceDownUntil = 0;
  let generatedCount = 0;
  let failedCount = 0;

  const report = (index: number, status: 'generating' | 'done' | 'failed'): void => {
    try {
      options.onJobProgress?.({ jobId: jobs[index]!.id, index: index + 1, total: jobs.length, status });
    } catch (err) {
      log(`[muse] onJobProgress failed: ${reasonOf(err)}`);
    }
  };

  const runWorker = async (worker: MuseWorker): Promise<void> => {
    for (;;) {
      if (loggedOut.has(worker.profileId)) return;
      const index = queue.shift();
      if (index === undefined) return;
      const job = jobs[index]!;

      const waitMs = serviceDownUntil - Date.now();
      if (waitMs > 0) {
        log(`[muse] ${worker.label}: Muse service is down - waiting ${Math.round(waitMs / 1000)}s before ${job.id}`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }

      attempts[index]! += 1;
      report(index, 'generating');
      log(`[muse] ${worker.label} → ${job.id} (try ${attempts[index]}/${maxAttempts}, ${queue.length} waiting)`);
      try {
        const response = await museBrowserService.generateImageOnPage(worker.page, job.prompt, {
          outputDir: job.outputDir,
          fileName: job.fileName,
          aspectRatio: job.aspectRatio,
          skipResize: job.skipResize,
          ...(job.referenceImagePaths?.length ? { referenceImagePaths: job.referenceImagePaths } : {}),
        });
        const localPath = response.mediaAssets?.find(asset => asset.localPath)?.localPath;
        results[index] = { id: job.id, ok: true, localPath };
        generatedCount += 1;
        report(index, 'done');
      } catch (err) {
        const reason = reasonOf(err);
        if (isAppError(err) && err.code === 'MUSE_NOT_LOGGED_IN') {
          loggedOut.add(worker.profileId);
          attempts[index]! -= 1;
          queue.unshift(index);
          log(`[muse] ${worker.label} is not logged into muse.ai - its tabs stop, ${job.id} goes back to the queue`);
          return;
        }
        if (isAppError(err) && err.code === 'MUSE_SERVICE_UNAVAILABLE') {
          serviceDownUntil = Math.max(serviceDownUntil, Date.now() + SERVICE_DOWN_WAIT_MS * attempts[index]!);
        }
        if (attempts[index]! < maxAttempts) {
          log(`[muse] ${job.id} try ${attempts[index]}/${maxAttempts} failed → back to the queue (${reason})`);
          queue.push(index);
        } else {
          log(`[muse] ${job.id} failed after ${maxAttempts} tries: ${reason}`);
          results[index] = { id: job.id, ok: false, error: reason };
          failedCount += 1;
          report(index, 'failed');
        }
      }
    }
  };

  /** Open a profile's windows; each starts working as soon as its Muse side chat is ready. */
  const startProfile = async (profile: ChromeProfile, tabs: number): Promise<Promise<void>[]> => {
    log(`[muse] Opening Chrome profile ${profile.name} (${tabs} tab)`);
    await openChromeProfile(profile.id, profile.userDataDir, { background: true, startUrl: MUSE_BASE_URL, gpu: true });
    openedProfileIds.add(profile.id);
    const handler = getMuseBrowserHandler();
    return Array.from({ length: tabs }, async (_, tabIndex) => {
      if (tabIndex > 0) await randomDelay(TAB_START_GAP_MS[0] * tabIndex, TAB_START_GAP_MS[1] * tabIndex);
      if (queue.length === 0 || loggedOut.has(profile.id)) return;
      const label = `${profile.name}#${tabIndex + 1}`;
      try {
        const page = tabIndex === 0 ? await getChromeProfilePage(profile.id) : await createChromeProfileWindow(profile.id);
        await handler.open(page);
        await runWorker({ label, profileId: profile.id, page });
      } catch (err) {
        if (isAppError(err) && err.code === 'MUSE_NOT_LOGGED_IN') loggedOut.add(profile.id);
        log(`[muse] Tab ${label} stopped: ${reasonOf(err)}`);
      }
    });
  };

  try {
    // Fill profiles in order: no more tabs than images.
    let remainingTabs = jobs.length;
    const runs: Promise<void>[] = [];
    for (const profile of profiles) {
      if (remainingTabs <= 0) break;
      const tabs = Math.min(tabsPerProfile, remainingTabs);
      remainingTabs -= tabs;
      try {
        runs.push(...(await startProfile(profile, tabs)));
      } catch (err) {
        log(`[muse] Skipping Chrome profile ${profile.name}: ${reasonOf(err)}`);
      }
    }
    await Promise.all(runs);

    // Images still queued: every profile dropped out (not logged in) before they could run.
    for (const index of queue.splice(0)) {
      results[index] = { id: jobs[index]!.id, ok: false, error: 'No Muse profile logged into muse.ai was left to run it' };
      failedCount += 1;
      report(index, 'failed');
    }
    if (generatedCount === 0 && loggedOut.size === openedProfileIds.size && loggedOut.size > 0) {
      throw new AppError('No Muse Chrome profile is logged into muse.ai', 401, 'MUSE_NOT_LOGGED_IN');
    }
    log(`[muse] batch done: ${generatedCount} saved, ${failedCount} failed`);
    return { results, generatedCount, failedCount };
  } finally {
    await closeChromeProfiles([...openedProfileIds]).catch(() => undefined);
  }
}
