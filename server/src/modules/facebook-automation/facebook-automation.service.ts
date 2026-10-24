import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../config/env.js';
import {
  connectPlaywrightToGpmProfile,
  disconnectGpmPlaywright,
  resolveGpmProfileIdByEmail,
} from '../../infrastructure/gpm/gpm-playwright.connector.js';
import { AppError } from '../../shared/http/errors.js';
import { facebookPagesRepository } from '../facebook-pages/facebook-pages.repository.js';
import { facebookPagesService } from '../facebook-pages/facebook-pages.service.js';
import type { FacebookPage } from '../facebook-pages/facebook-pages.types.js';
import { createFacebookPage, publishPagePost, publishReel } from './facebook-flow.js';
import { probeFacebookSelectors, type SelectorProbeResult } from './facebook-probe.js';

/** Only files under the app data dir may be uploaded (blocks arbitrary-file reads via the API). */
function resolveDataFile(file: string): string {
  const root = path.resolve(env.dataDir);
  const resolved = path.resolve(root, file);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new AppError('File must be inside the data directory', 400, 'INVALID_FILE_PATH');
  }
  if (!fs.existsSync(resolved)) {
    throw new AppError('File not found', 404, 'FILE_NOT_FOUND');
  }
  return resolved;
}

async function withPage<T>(
  page: FacebookPage,
  run: (page: import('playwright').Page) => Promise<T>,
): Promise<T> {
  const email = page.linkedEmail.trim();
  if (!email || email.toLowerCase() === 'default') {
    throw new AppError('Page linkedEmail is required for GPM automation', 400, 'MISSING_EMAIL');
  }
  const profileId = await resolveGpmProfileIdByEmail(email);
  const connection = await connectPlaywrightToGpmProfile(profileId);
  try {
    return await run(connection.page);
  } finally {
    await disconnectGpmPlaywright(connection);
  }
}

function requirePageUrl(page: FacebookPage): string {
  if (!page.pageUrl) {
    throw new AppError('Page has no URL yet — create it on Facebook first', 400, 'MISSING_PAGE_URL');
  }
  return page.pageUrl;
}

export class FacebookAutomationService {
  async createOnFacebook(id: string): Promise<FacebookPage> {
    const page = facebookPagesService.get(id);
    if (page.pageUrl) {
      throw new AppError('Page already has a URL', 409, 'ALREADY_CREATED');
    }
    const pageUrl = await withPage(page, (p) =>
      createFacebookPage(p, { name: page.name, category: page.category, bio: page.bio }),
    );
    return facebookPagesService.update(id, { pageUrl, status: 'created' });
  }

  async post(id: string, input: { text: string; imageFile?: string }): Promise<FacebookPage> {
    const page = facebookPagesService.get(id);
    const pageUrl = requirePageUrl(page);
    const imagePath = input.imageFile ? resolveDataFile(input.imageFile) : undefined;
    await withPage(page, (p) => publishPagePost(p, pageUrl, { text: input.text, imagePath }));
    return this.markPosted(id);
  }

  async uploadVideo(id: string, input: { videoFile: string; caption: string }): Promise<FacebookPage> {
    const page = facebookPagesService.get(id);
    const pageUrl = requirePageUrl(page);
    const videoPath = resolveDataFile(input.videoFile);
    await withPage(page, (p) => publishReel(p, pageUrl, { videoPath, caption: input.caption }));
    return this.markPosted(id);
  }

  /** Probes the selector groups against whatever Facebook screen is open in the page's profile. */
  async probe(id: string): Promise<SelectorProbeResult[]> {
    const page = facebookPagesService.get(id);
    return withPage(page, (p) => probeFacebookSelectors(p));
  }

  private markPosted(id: string): FacebookPage {
    const updated = facebookPagesRepository.update(id, (page) => ({
      ...page,
      status: 'active',
      lastPostAt: new Date().toISOString(),
    }));
    if (!updated) throw new AppError('Facebook page not found', 404, 'NOT_FOUND');
    return updated;
  }
}

export const facebookAutomationService = new FacebookAutomationService();
