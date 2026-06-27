import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { AppError } from '../../shared/http/errors.js';
import {
  listGpmProfiles,
  startGpmProfile,
  stopGpmProfile,
  type GpmProfile,
  type GpmStartResult,
} from './gpm-api.client.js';

export interface GpmPlaywrightConnection {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  profileId: string;
}

const CDP_READY_TIMEOUT_MS = 60_000;
const CDP_POLL_INTERVAL_MS = 500;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function profileMatchesEmail(profile: GpmProfile, email: string): boolean {
  const normalized = normalizeEmail(email);
  const name = String(profile.name ?? '').trim().toLowerCase();
  const note = String(profile.note ?? '').trim().toLowerCase();
  return name === normalized || name.includes(normalized) || note.includes(normalized);
}

export async function resolveGpmProfileIdByEmail(email: string): Promise<string> {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    throw new AppError('Channel linkedEmail is empty', 400, 'INVALID_EMAIL');
  }

  const result = await listGpmProfiles({ search: normalized, page: 1, page_size: 50 });
  const profiles = result.data ?? [];

  const exactName = profiles.find(p => normalizeEmail(p.name) === normalized);
  if (exactName) return exactName.id;

  const matches = profiles.filter(p => profileMatchesEmail(p, normalized));
  if (matches.length === 1) return matches[0].id;

  if (matches.length > 1) {
    const names = matches.map(p => p.name).join(', ');
    throw new AppError(
      `Multiple GPM profiles match email «${email}»: ${names}`,
      409,
      'GPM_PROFILE_AMBIGUOUS',
    );
  }

  throw new AppError(`No GPM profile found for email «${email}»`, 404, 'GPM_PROFILE_NOT_FOUND');
}

async function waitForInitialPage(context: BrowserContext): Promise<Page> {
  const existing = context.pages()[0];
  if (existing) return existing;

  try {
    return await context.waitForEvent('page', { timeout: 5_000 });
  } catch {
    return context.newPage();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function resolveCdpHttpEndpoint(start: GpmStartResult): string {
  const address = start.remote_debugging_address?.trim();
  if (address) {
    return address.startsWith('http') ? address : `http://${address}`;
  }

  const port = start.remote_debugging_port;
  if (port) return `http://127.0.0.1:${port}`;

  const wsUrl = start.websocket_debugging_url?.trim();
  if (wsUrl?.startsWith('ws')) {
    throw new AppError(
      'GPM returned websocket URL only; need remote_debugging_address for readiness polling',
      502,
      'GPM_START_FAILED',
    );
  }

  throw new AppError('GPM did not return remote_debugging_address', 502, 'GPM_START_FAILED');
}

async function fetchCdpWebSocketUrl(httpEndpoint: string): Promise<string> {
  const base = httpEndpoint.replace(/\/+$/, '');
  const deadline = Date.now() + CDP_READY_TIMEOUT_MS;
  let lastDetail = 'unknown error';

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/json/version`);
      if (response.ok) {
        const payload = (await response.json()) as { webSocketDebuggerUrl?: string };
        const wsUrl = payload.webSocketDebuggerUrl?.trim();
        if (wsUrl) return wsUrl;
        lastDetail = 'missing webSocketDebuggerUrl in /json/version';
      } else {
        lastDetail = `/json/version returned ${response.status}`;
      }
    } catch (err) {
      lastDetail = err instanceof Error ? err.message : String(err);
    }

    await sleep(CDP_POLL_INTERVAL_MS);
  }

  throw new AppError(
    `CDP not ready at ${httpEndpoint} after ${CDP_READY_TIMEOUT_MS / 1000}s (${lastDetail})`,
    502,
    'GPM_CDP_TIMEOUT',
  );
}

async function connectOverCdp(httpEndpoint: string): Promise<Browser> {
  console.log(`[gpm-playwright] Waiting for CDP at ${httpEndpoint}...`);
  const wsUrl = await fetchCdpWebSocketUrl(httpEndpoint);
  console.log(`[gpm-playwright] CDP ready → ${wsUrl}`);
  return chromium.connectOverCDP(wsUrl);
}

async function openGpmBrowserSession(profileId: string): Promise<{ browser: Browser; start: GpmStartResult }> {
  const start = await startGpmProfile(profileId);
  const httpEndpoint = resolveCdpHttpEndpoint(start);
  console.log(
    `[gpm-playwright] Started profile ${start.profile_id || profileId} (debug: ${httpEndpoint})`,
  );

  try {
    const browser = await connectOverCdp(httpEndpoint);
    return { browser, start };
  } catch (firstErr) {
    const detail = firstErr instanceof Error ? firstErr.message : String(firstErr);
    console.warn(`[gpm-playwright] CDP connect failed (${detail}), closing profile and retrying once...`);

    try {
      await stopGpmProfile(profileId);
    } catch {
      /* ignore close errors */
    }

    await sleep(2_000);

    const retryStart = await startGpmProfile(profileId);
    const retryEndpoint = resolveCdpHttpEndpoint(retryStart);
    console.log(`[gpm-playwright] Retry start profile (debug: ${retryEndpoint})`);
    const browser = await connectOverCdp(retryEndpoint);
    return { browser, start: retryStart };
  }
}

export async function connectPlaywrightToGpmProfile(profileId: string): Promise<GpmPlaywrightConnection> {
  const { browser, start } = await openGpmBrowserSession(profileId);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = await waitForInitialPage(context);
  await page.bringToFront();

  return {
    browser,
    context,
    page,
    profileId: String(start.profile_id || profileId).trim() || profileId,
  };
}

export async function detachGpmPlaywright(connection: GpmPlaywrightConnection): Promise<void> {
  try {
    await connection.browser.close();
  } catch {
    /* ignore */
  }
}

export async function disconnectGpmPlaywright(connection: GpmPlaywrightConnection): Promise<void> {
  try {
    await connection.context.close();
  } catch {
    /* ignore */
  }

  try {
    await connection.browser.close();
  } catch {
    /* ignore */
  }

  try {
    await stopGpmProfile(connection.profileId);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(`[gpm-playwright] stopProfile failed for ${connection.profileId}: ${detail}`);
  }
}

export const GPM_CLOSE_DELAY_MS = 15 * 60 * 1000;

export function scheduleDelayedGpmDisconnect(
  connection: GpmPlaywrightConnection,
  delayMs = GPM_CLOSE_DELAY_MS,
): void {
  const profileId = connection.profileId;
  void (async () => {
    try {
      console.log(`[youtube-upload] Waiting ${delayMs / 60_000} min before closing GPM profile ${profileId}`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    } catch (err) {
      console.warn('[youtube-upload] Delay before GPM close:', err instanceof Error ? err.message : err);
    }

    await disconnectGpmPlaywright(connection);
  })().catch(err => {
    console.warn('[youtube-upload] Background GPM disconnect failed:', err instanceof Error ? err.message : err);
  });
}
