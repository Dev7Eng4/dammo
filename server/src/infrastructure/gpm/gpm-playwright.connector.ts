import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { AppError } from '../../shared/http/errors.js';
import {
  listGpmProfiles,
  startGpmProfile,
  stopGpmProfile,
  type GpmProfile,
} from './gpm-api.client.js';

export interface GpmPlaywrightConnection {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  profileId: string;
}

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

export async function connectPlaywrightToGpmProfile(profileId: string): Promise<GpmPlaywrightConnection> {
  const start = await startGpmProfile(profileId);
  const wsUrl = start.websocket_debugging_url?.trim();

  if (!wsUrl) {
    throw new AppError('GPM did not return websocket_debugging_url', 502, 'GPM_START_FAILED');
  }

  const browser = await chromium.connectOverCDP(wsUrl);
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
