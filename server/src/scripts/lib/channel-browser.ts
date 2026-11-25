/**
 * From an email (or a channel of the app) to a signed-in browser: GPM profile, one of the app's Chrome profiles, or a
 * Chrome the user opened with a debugging port. Shared by the skills that work inside YouTube (studio, audience).
 * Nothing here signs in: the profile must already be signed in by the user.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type BrowserContext } from 'playwright';
import { env } from '../../config/env.js';
import {
  connectPlaywrightToGpmProfile,
  detachGpmPlaywright,
  disconnectGpmPlaywright,
  resolveGpmProfileIdByEmail,
  type GpmPlaywrightConnection,
} from '../../infrastructure/gpm/gpm-playwright.connector.js';
import { pingGpm } from '../../infrastructure/gpm/gpm-api.client.js';
import { youtubeChannelsRepository } from '../../modules/youtube-channels/youtube-channels.repository.js';
import type { YoutubeChannel } from '../../modules/youtube-channels/youtube-channels.types.js';

export const mask = (email: string) => email.replace(/^(.{2})[^@]*(@.*)$/, '$1***$2');
export const normalizeEmail = (value: string) => value.trim().toLowerCase();

export interface Session {
  context: BrowserContext;
  label: string;
  /** `keep`: leave the browser running, only let go of it. */
  close: (keep: boolean) => Promise<unknown>;
}

/** Deleted channels keep their email; the app allows one live channel per email. */
export function channelByEmail(email: string): YoutubeChannel | undefined {
  return youtubeChannelsRepository.findAll().find(c => c.status !== 'deleted' && normalizeEmail(c.linkedEmail ?? '') === email);
}

function requireEmail(input: string | undefined): string {
  const email = normalizeEmail(input ?? '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Cần một email, ví dụ: ten@gmail.com');
  return email;
}

export async function resolve(input: string | undefined) {
  const email = requireEmail(input);
  const channel = channelByEmail(email);
  if (!channel) throw new Error(`Không có kênh nào trong app gắn email ${mask(email)} (kênh để "Default" không tìm được bằng email)`);
  const gpm = await pingGpm();
  if (!gpm.connected) throw new Error(`GPM chưa chạy (${gpm.baseUrl}): mở phần mềm GPM-Login rồi chạy lại.`);
  const profileId = await resolveGpmProfileIdByEmail(email);
  return { email, channel, profileId };
}

/** Channel for a run that uses the user's own Chrome: one they opened with a debugging port, or a profile of the app. */
export function resolveWithoutGpm(input: string | undefined, flags: Record<string, string>): { email: string; channel: YoutubeChannel; profileId: string } {
  if (flags.cdp && !['127.0.0.1', 'localhost'].includes(new URL(flags.cdp).hostname)) throw new Error('--cdp chỉ nhận Chrome trên máy này (127.0.0.1)');
  const wanted = flags.channel?.trim();
  const channel = wanted
    ? youtubeChannelsRepository.findAll().find(c => c.status !== 'deleted' && (c.id === wanted || c.channelId === wanted))
    : channelByEmail(requireEmail(input));
  if (!channel) throw new Error('Không tìm thấy kênh: đưa email, hoặc --channel <id kênh trong app>');
  return { email: channel.linkedEmail ?? '', channel, profileId: '' };
}

async function connectLocalChrome(endpoint: string): Promise<GpmPlaywrightConnection> {
  let browser;
  try {
    browser = await chromium.connectOverCDP(endpoint, { timeout: 10_000 });
  } catch {
    throw new Error(`Không nối được Chrome ở ${endpoint}: Chrome chưa mở với cổng gỡ lỗi đó.`);
  }
  const context = browser.contexts()[0];
  if (!context) throw new Error('Chrome không có cửa sổ nào.');
  return { browser, context, page: context.pages()[0], profileId: '' };
}

/** One of the app's Chrome profiles (Chrome Profiles screen), opened visibly. Refuses a profile that is already open. */
async function openAppChromeProfile(wanted: string): Promise<Session> {
  const { chromeProfilesService } = await import('../../modules/chrome-profiles/chrome-profiles.service.js');
  const { buildChromeLaunchOptions } = await import('../../infrastructure/chrome/browser-launch.config.js');
  const profiles = chromeProfilesService.list().items;
  const profile = profiles.find(p => p.id === wanted) ?? profiles.find(p => p.name.toLowerCase() === wanted.toLowerCase());
  if (!profile) throw new Error(`Không có Chrome profile "${wanted}". Có: ${profiles.map(p => p.name).join(', ')}`);
  // Chrome keeps this file locked while the profile is open; a second Chrome on it would corrupt the profile.
  const lock = path.join(profile.userDataDir, 'lockfile');
  if (fs.existsSync(lock)) {
    try {
      fs.closeSync(fs.openSync(lock, 'r+'));
    } catch {
      throw new Error(`Chrome profile "${profile.name}" đang mở: đóng nó rồi chạy lại.`);
    }
  }
  const context = await chromium.launchPersistentContext(profile.userDataDir, buildChromeLaunchOptions(false));
  return { context, label: `Chrome profile "${profile.name}"`, close: async () => context.close() };
}

export async function openSession(target: { email: string; profileId: string }, flags: Record<string, string>): Promise<Session> {
  if (flags['chrome-profile']) return openAppChromeProfile(flags['chrome-profile']);
  if (flags.cdp) {
    const connection = await connectLocalChrome(flags.cdp);
    return { context: connection.context, label: `Chrome đang mở ở ${flags.cdp}`, close: async () => detachGpmPlaywright(connection) };
  }
  const connection = await connectPlaywrightToGpmProfile(target.profileId, { foreground: true });
  return { context: connection.context, label: 'profile GPM', close: async keep => (keep ? detachGpmPlaywright(connection) : disconnectGpmPlaywright(connection)) };
}

export async function serverBusy(): Promise<number> {
  try {
    const response = await fetch(`http://localhost:${env.port}/api/v1/task-queue?view=summary`, { signal: AbortSignal.timeout(5000) });
    const { items } = (await response.json()) as { items: Array<{ status: string }> };
    return items.filter(item => item.status === 'queued' || item.status === 'running').length;
  } catch {
    return 0;
  }
}
