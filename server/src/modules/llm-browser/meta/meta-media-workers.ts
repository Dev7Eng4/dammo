import type { Page } from 'playwright';
import {
  connectPlaywrightToGpmProfile,
  disconnectGpmPlaywright,
  type GpmPlaywrightConnection,
} from '../../../infrastructure/gpm/gpm-playwright.connector.js';
import type { GpmProfile } from '../../../infrastructure/gpm/gpm-api.client.js';
import { getMetaBrowserHandler } from '../core/registry.js';
import type { MetaConcurrencyMode } from './meta.types.js';
import { META_BASE_URL } from './meta.config.js';
import { AppError } from '../../../shared/http/errors.js';
import {
  closeChromeProfiles,
  createChromeProfileWindow,
  getChromeProfilePage,
  openChromeProfile,
} from '../../chrome-profiles/chrome-profile.runner.js';
import { chromeProfilesService } from '../../chrome-profiles/chrome-profiles.service.js';
import type { ChromeProfile } from '../../chrome-profiles/chrome-profiles.types.js';
import { gpmManagerService } from '../../gpm-manager/gpm-manager.service.js';
import { appSettingsService } from '../../app-settings/app-settings.service.js';
import { isMetaProfileQuotaExhausted } from './meta-quota.js';

export const META_MEDIA_DEFAULT_TIMEOUT_MS = 300_000;
export const META_MEDIA_DEFAULT_MAX_RETRIES = 3;

export interface MetaMediaWorker {
  workerIndex: number;
  label: string;
  page: Page;
  kind: 'chrome' | 'gpm';
  profileId: string;
}

export interface MetaMediaWorkerPool {
  workers: MetaMediaWorker[];
  gpmConnections: GpmPlaywrightConnection[];
  /** Chrome profiles opened for this pool, including the ones none of whose tabs became a worker. */
  chromeProfileIds: Set<string>;
}

export interface OpenMetaWorkersOptions {
  /** Jobs left to run: never opens more tabs than that. */
  jobCount: number;
  mode: MetaConcurrencyMode;
  log: (msg: string) => void;
  /** Called as soon as a tab is ready, while the others may still be opening. */
  onWorker: (worker: MetaMediaWorker) => void;
  /** Resolves when no more workers are needed: tabs still opening are given up. */
  done: Promise<void>;
}

export interface ChromeTabAllocation<T> {
  profile: T;
  tabs: number;
}

export function createMetaWorkerPool(): MetaMediaWorkerPool {
  return { workers: [], gpmConnections: [], chromeProfileIds: new Set() };
}

/** Fill profiles in order, up to `tabsPerProfile` each, until every job has a tab. */
export function allocateChromeTabs<T>(
  profiles: readonly T[],
  jobCount: number,
  tabsPerProfile: number,
): ChromeTabAllocation<T>[] {
  const allocations: ChromeTabAllocation<T>[] = [];
  let remaining = jobCount;
  for (const profile of profiles) {
    if (remaining <= 0) break;
    const tabs = Math.min(tabsPerProfile, remaining);
    allocations.push({ profile, tabs });
    remaining -= tabs;
  }
  return allocations;
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function addWorker(
  pool: MetaMediaWorkerPool,
  options: OpenMetaWorkersOptions,
  worker: Omit<MetaMediaWorker, 'workerIndex'>,
): void {
  const added: MetaMediaWorker = { workerIndex: pool.workers.length, ...worker };
  pool.workers.push(added);
  options.log(`[meta] Worker ${added.workerIndex + 1} sẵn sàng trên ${added.label}`);
  options.onWorker(added);
}

/** Load Meta in a tab; false when it failed or is no longer needed. */
async function openMetaTab(
  page: Page,
  profileName: string,
  options: OpenMetaWorkersOptions,
): Promise<boolean> {
  const handler = getMetaBrowserHandler();
  const opening = handler
    .open(page)
    .then(() => handler.setupConfig(page, {}))
    .then(
      () => true,
      err => {
        options.log(`[meta] Bỏ qua tab trên ${profileName}: ${reasonOf(err)}`);
        return false;
      },
    );
  return Promise.race([opening, options.done.then(() => false)]);
}

async function openChromeWorkers(
  pool: MetaMediaWorkerPool,
  profile: ChromeProfile,
  tabs: number,
  options: OpenMetaWorkersOptions,
): Promise<void> {
  try {
    options.log(`[meta] Mở Chrome main profile ${profile.name} (${tabs} tab)...`);
    // GPU on: Meta's menus are too heavy to draw on the CPU once several windows are open.
    await openChromeProfile(profile.id, profile.userDataDir, { background: true, startUrl: META_BASE_URL, gpu: true });
    pool.chromeProfileIds.add(profile.id);

    const openTab = async (page: Page): Promise<void> => {
      if (!(await openMetaTab(page, profile.name, options))) return;
      addWorker(pool, options, { label: `chrome:${profile.name}`, page, kind: 'chrome', profileId: profile.id });
    };
    // Every worker gets its own window, so mouse and scroll stay fast in all of them.
    await Promise.all(
      Array.from({ length: tabs }, async (_, tabIndex) => {
        try {
          await openTab(tabIndex === 0 ? await getChromeProfilePage(profile.id) : await createChromeProfileWindow(profile.id));
        } catch (err) {
          options.log(`[meta] Bỏ qua tab ${tabIndex + 1} trên ${profile.name}: ${reasonOf(err)}`);
        }
      }),
    );
  } catch (err) {
    options.log(`[meta] Bỏ qua Chrome profile ${profile.name}: ${reasonOf(err)}`);
  }
}

async function openGpmWorker(
  pool: MetaMediaWorkerPool,
  profile: GpmProfile,
  options: OpenMetaWorkersOptions,
): Promise<void> {
  try {
    options.log(`[meta] Start GPM profile ${profile.name}...`);
    const connection = await connectPlaywrightToGpmProfile(profile.id);
    pool.gpmConnections.push(connection);
    if (!(await openMetaTab(connection.page, profile.name, options))) return;
    addWorker(pool, options, {
      label: `gpm:${profile.name}`,
      page: connection.page,
      kind: 'gpm',
      profileId: connection.profileId,
    });
  } catch (err) {
    options.log(`[meta] Bỏ qua GPM profile ${profile.name}: ${reasonOf(err)}`);
  }
}

/** Drop profiles that recently ran out of Meta image quota, logging which ones were skipped. */
function withoutQuotaExhausted<T extends { id: string; name: string }>(
  profiles: T[],
  log: (msg: string) => void,
): T[] {
  const skipped = profiles.filter(profile => isMetaProfileQuotaExhausted(profile.id));
  if (skipped.length > 0) {
    log(`[meta] Bỏ qua profile hết quota tạo ảnh: ${skipped.map(profile => profile.name).join(', ')}`);
  }
  return profiles.filter(profile => !isMetaProfileQuotaExhausted(profile.id));
}

async function listGpmCandidates(log: (msg: string) => void): Promise<GpmProfile[]> {
  try {
    return withoutQuotaExhausted(await gpmManagerService.listMetaEnabledProfiles(), log);
  } catch (err) {
    const code = err instanceof AppError ? err.code : undefined;
    log(`[meta] GPM meta profiles unavailable (${code ?? 'error'}): ${reasonOf(err)}`);
    return [];
  }
}

/**
 * Open tabs on Chrome main profiles, then GPM meta profiles for the jobs left over, all in parallel.
 * Resolves when every tab has opened or failed. A profile that fails to open is skipped; when none
 * of the chosen ones worked, the remaining profiles are tried.
 *
 * `batch`: up to `metaTabsPerProfile` (app settings) windows per profile. `single`: one tab in total.
 */
export async function openMetaWorkers(pool: MetaMediaWorkerPool, options: OpenMetaWorkersOptions): Promise<void> {
  const { log, mode } = options;
  const tabsPerProfile = mode === 'single' ? 1 : appSettingsService.get().metaTabsPerProfile;
  const jobCount = mode === 'single' ? Math.min(1, options.jobCount) : options.jobCount;
  const opened = pool.workers.length;
  const hasNewWorker = (): boolean => pool.workers.length > opened;

  let chromeCandidates = withoutQuotaExhausted(chromeProfilesService.listProfilesForLlm('image', 'meta'), log);
  let gpmCandidates: GpmProfile[] | undefined;
  let anyCandidate = false;

  do {
    const chrome = allocateChromeTabs(chromeCandidates, jobCount, tabsPerProfile);
    chromeCandidates = chromeCandidates.slice(chrome.length);
    const chromeTabs = chrome.reduce((sum, allocation) => sum + allocation.tabs, 0);

    const gpmNeeded = Math.max(0, jobCount - chromeTabs);
    if (gpmNeeded > 0) gpmCandidates ??= await listGpmCandidates(log);
    const gpm = gpmNeeded > 0 ? (gpmCandidates ?? []).slice(0, gpmNeeded) : [];
    if (gpm.length > 0) gpmCandidates = (gpmCandidates ?? []).slice(gpm.length);

    if (chrome.length === 0 && gpm.length === 0) break;
    anyCandidate = true;
    log(
      `[meta] Capacity: mode=${mode}, jobs=${options.jobCount}, tabsPerMain=${tabsPerProfile}, ` +
        `chrome=${chrome.map(({ profile, tabs }) => `${profile.name}×${tabs}`).join(', ') || '(none)'}, ` +
        `gpm=${gpm.map(profile => profile.name).join(', ') || '(none)'}`,
    );

    await Promise.all([
      ...chrome.map(({ profile, tabs }) => openChromeWorkers(pool, profile, tabs, options)),
      ...gpm.map(profile => openGpmWorker(pool, profile, options)),
    ]);
  } while (!hasNewWorker());

  if (hasNewWorker()) return;
  if (!anyCandidate) {
    throw new AppError(
      'No Chrome main or GPM meta-enabled profiles available for Meta media',
      400,
      'META_MEDIA_NO_PROFILES',
    );
  }
  throw new AppError('Failed to open any Meta workers (Chrome/GPM)', 502, 'META_MEDIA_NO_WORKERS');
}

export async function cleanupMetaWorkerPool(
  pool: MetaMediaWorkerPool,
  log: (msg: string) => void,
): Promise<void> {
  await Promise.all(
    pool.gpmConnections.map(async connection => {
      try {
        await disconnectGpmPlaywright(connection);
        log(`[meta] Closed GPM profile ${connection.profileId}`);
      } catch (err) {
        log(`[meta] Failed to close GPM ${connection.profileId}: ${reasonOf(err)}`);
      }
    }),
  );

  if (pool.chromeProfileIds.size === 0) return;

  const closedIds = await closeChromeProfiles([...pool.chromeProfileIds]);
  for (const profileId of closedIds) {
    log(`[meta] Closed Chrome profile ${profileId}`);
  }
}
