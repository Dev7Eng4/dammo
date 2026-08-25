import type { Page } from 'playwright';
import {
  connectPlaywrightToGpmProfile,
  disconnectGpmPlaywright,
  type GpmPlaywrightConnection,
} from '../../infrastructure/gpm/gpm-playwright.connector.js';
import type { GpmProfile } from '../../infrastructure/gpm/gpm-api.client.js';
import { getMetaBrowserHandler } from '../../infrastructure/llm-browser/llm-browser.registry.js';
import type { MetaConcurrencyMode } from '../../infrastructure/llm-browser/llm-browser.types.js';
import { AppError } from '../../shared/http/errors.js';
import {
  closeChromeProfiles,
  createChromeProfilePage,
  getChromeProfilePage,
  openChromeProfile,
} from '../chrome-profiles/chrome-profile.runner.js';
import { chromeProfilesService } from '../chrome-profiles/chrome-profiles.service.js';
import type { ChromeProfile } from '../chrome-profiles/chrome-profiles.types.js';
import { gpmManagerService } from '../gpm-manager/gpm-manager.service.js';

export const META_MEDIA_TABS_PER_MAIN_PROFILE = 5;
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
  mode: MetaConcurrencyMode;
}

async function openMetaOnPage(page: Page): Promise<void> {
  const handler = getMetaBrowserHandler();
  await handler.open(page);
  await handler.setupConfig(page, {});
}

async function openChromeMetaWorkers(
  tabProfiles: ChromeProfile[],
  startIndex: number,
  log: (msg: string) => void,
): Promise<MetaMediaWorker[]> {
  if (tabProfiles.length === 0) return [];

  const uniqueProfiles = [...new Map(tabProfiles.map(profile => [profile.id, profile])).values()];
  for (const profile of uniqueProfiles) {
    log(`[meta] Mở Chrome main profile ${profile.name}...`);
    await openChromeProfile(profile.id, profile.userDataDir, { background: true });
  }

  const reusedInitialPage = new Set<string>();
  const workers: MetaMediaWorker[] = [];
  for (const profile of tabProfiles) {
    try {
      const page = reusedInitialPage.has(profile.id)
        ? await createChromeProfilePage(profile.id)
        : await getChromeProfilePage(profile.id);
      reusedInitialPage.add(profile.id);
      await openMetaOnPage(page);
      const workerIndex = startIndex + workers.length;
      workers.push({
        workerIndex,
        label: `chrome:${profile.name}`,
        page,
        kind: 'chrome',
        profileId: profile.id,
      });
      log(`[meta] Worker ${workerIndex + 1} sẵn sàng trên Chrome ${profile.name}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      log(`[meta] Bỏ qua Chrome tab trên ${profile.name}: ${reason}`);
    }
  }

  return workers;
}

function allocateChromeMetaTabProfiles(
  profiles: ChromeProfile[],
  pendingCount: number,
  tabsPerMain: number,
): ChromeProfile[] {
  const tabProfiles: ChromeProfile[] = [];

  for (const profile of profiles) {
    const remaining = pendingCount - tabProfiles.length;
    if (remaining <= 0) break;

    const tabCount = Math.min(tabsPerMain, remaining);
    for (let tabIndex = 0; tabIndex < tabCount; tabIndex += 1) {
      tabProfiles.push(profile);
    }
  }

  return tabProfiles;
}

async function openGpmMetaWorkers(
  profiles: GpmProfile[],
  startIndex: number,
  log: (msg: string) => void,
): Promise<{ workers: MetaMediaWorker[]; connections: GpmPlaywrightConnection[] }> {
  if (profiles.length === 0) return { workers: [], connections: [] };

  const results = await Promise.all(
    profiles.map(async profile => {
      try {
        log(`[meta] Start GPM profile ${profile.name}...`);
        const connection = await connectPlaywrightToGpmProfile(profile.id);
        await openMetaOnPage(connection.page);
        return { profile, connection, error: null as string | null };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        log(`[meta] Bỏ qua GPM profile ${profile.name}: ${reason}`);
        return { profile, connection: null, error: reason };
      }
    }),
  );

  const workers: MetaMediaWorker[] = [];
  const connections: GpmPlaywrightConnection[] = [];

  for (const result of results) {
    if (!result.connection) continue;
    const workerIndex = startIndex + workers.length;
    workers.push({
      workerIndex,
      label: `gpm:${result.profile.name}`,
      page: result.connection.page,
      kind: 'gpm',
      profileId: result.connection.profileId,
    });
    connections.push(result.connection);
    log(`[meta] Worker ${workerIndex + 1} sẵn sàng trên GPM ${result.profile.name}`);
  }

  return { workers, connections };
}

export async function openMetaWorkerPool(
  pendingCount: number,
  log: (msg: string) => void,
  mode: MetaConcurrencyMode = 'batch',
): Promise<MetaMediaWorkerPool> {
  if (mode === 'single') {
    return openMetaWorkerPoolSingle(log);
  }
  return openMetaWorkerPoolBatch(pendingCount, log);
}

/** Exactly 1 tab on 1 profile (Chrome main first, else first GPM meta). */
async function openMetaWorkerPoolSingle(log: (msg: string) => void): Promise<MetaMediaWorkerPool> {
  const mains = chromeProfilesService.listMainProfiles();
  const firstMain = mains[0];

  log(
    `[meta] Capacity: mode=single, effectiveSlots=1, chromeMains=${mains.length}, ` +
      `tabsPerMain=1, prefer=${firstMain?.name ?? '(none)'}`,
  );

  if (firstMain) {
    log(`[meta] Mở Chrome main profile ${firstMain.name} (single)...`);
    await openChromeProfile(firstMain.id, firstMain.userDataDir, { background: true });
    try {
      const page = await getChromeProfilePage(firstMain.id);
      await openMetaOnPage(page);
      const worker: MetaMediaWorker = {
        workerIndex: 0,
        label: `chrome:${firstMain.name}`,
        page,
        kind: 'chrome',
        profileId: firstMain.id,
      };
      log(`[meta] Worker 1 sẵn sàng trên Chrome ${firstMain.name} (single)`);
      return { workers: [worker], gpmConnections: [], mode: 'single' };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      log(`[meta] Chrome single worker failed on ${firstMain.name}: ${reason}`);
      await closeChromeProfiles([firstMain.id]).catch(() => undefined);
    }
  }

  let gpmCandidates: GpmProfile[] = [];
  try {
    gpmCandidates = await gpmManagerService.listMetaEnabledProfiles();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const code = err instanceof AppError ? err.code : undefined;
    log(`[meta] GPM meta profiles unavailable (${code ?? 'error'}): ${reason}`);
  }

  const gpmProfile = gpmCandidates[0];
  if (!gpmProfile) {
    throw new AppError(
      'No Chrome main or GPM meta-enabled profiles available for Meta media',
      400,
      'META_MEDIA_NO_PROFILES',
    );
  }

  log(`[meta] Start GPM profile ${gpmProfile.name} (single)...`);
  const connection = await connectPlaywrightToGpmProfile(gpmProfile.id);
  await openMetaOnPage(connection.page);
  const worker: MetaMediaWorker = {
    workerIndex: 0,
    label: `gpm:${gpmProfile.name}`,
    page: connection.page,
    kind: 'gpm',
    profileId: connection.profileId,
  };
  log(`[meta] Worker 1 sẵn sàng trên GPM ${gpmProfile.name} (single)`);
  return { workers: [worker], gpmConnections: [connection], mode: 'single' };
}

async function openMetaWorkerPoolBatch(
  pendingCount: number,
  log: (msg: string) => void,
): Promise<MetaMediaWorkerPool> {
  const tabsPerMain = META_MEDIA_TABS_PER_MAIN_PROFILE;
  const mains = chromeProfilesService.listMainProfiles();
  const chromeTabProfiles = allocateChromeMetaTabProfiles(mains, pendingCount, tabsPerMain);
  const remainingAfterChrome = Math.max(0, pendingCount - chromeTabProfiles.length);

  let gpmCandidates: GpmProfile[] = [];
  if (remainingAfterChrome > 0) {
    try {
      gpmCandidates = await gpmManagerService.listMetaEnabledProfiles();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const code = err instanceof AppError ? err.code : undefined;
      log(`[meta] GPM meta profiles unavailable (${code ?? 'error'}): ${reason} — tiếp tục Chrome-only`);
      gpmCandidates = [];
    }
  }
  const gpmProfiles = gpmCandidates.slice(0, remainingAfterChrome);

  log(
    `[meta] Capacity: mode=batch, pending=${pendingCount}, effectiveSlots=${pendingCount}, ` +
      `chromeMains=${mains.length}, tabsPerMain=${tabsPerMain}, chromeTabs=${chromeTabProfiles.length}, ` +
      `gpmMeta=${gpmProfiles.length}` +
      (gpmProfiles.length > 0
        ? ` (${gpmProfiles.map(profile => profile.name).join(', ')})`
        : ''),
  );

  if (chromeTabProfiles.length === 0 && gpmProfiles.length === 0) {
    throw new AppError(
      'No Chrome main or GPM meta-enabled profiles available for Meta media',
      400,
      'META_MEDIA_NO_PROFILES',
    );
  }

  const chromeWorkers = await openChromeMetaWorkers(chromeTabProfiles, 0, log);
  const { workers: gpmWorkers, connections } = await openGpmMetaWorkers(
    gpmProfiles,
    chromeWorkers.length,
    log,
  );

  const workers = [...chromeWorkers, ...gpmWorkers];
  if (workers.length === 0) {
    for (const connection of connections) {
      await disconnectGpmPlaywright(connection).catch(() => undefined);
    }
    throw new AppError('Failed to open any Meta workers (Chrome/GPM)', 502, 'META_MEDIA_NO_WORKERS');
  }

  return { workers, gpmConnections: connections, mode: 'batch' };
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
        const reason = err instanceof Error ? err.message : String(err);
        log(`[meta] Failed to close GPM ${connection.profileId}: ${reason}`);
      }
    }),
  );

  const chromeProfileIds = [
    ...new Set(pool.workers.filter(worker => worker.kind === 'chrome').map(worker => worker.profileId)),
  ];

  if (chromeProfileIds.length === 0) return;

  const closedIds = await closeChromeProfiles(chromeProfileIds);
  for (const profileId of closedIds) {
    log(`[meta] Closed Chrome profile ${profileId}`);
  }
}
