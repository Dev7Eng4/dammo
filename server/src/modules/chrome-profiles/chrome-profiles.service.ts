import fs from 'node:fs/promises';
import { chromeProfileDir } from '../../config/paths.js';
import { AppError } from '../../shared/http/errors.js';
import { generateId } from '../../shared/id.js';
import {
  closeChromeProfiles,
  initializeChromeProfile,
  openChromeProfile,
} from './chrome-profile.runner.js';
import { chromeProfilesRepository } from './chrome-profiles.repository.js';
import {
  SUB_PROFILE_COUNT,
  type ChromeProfile,
  type ChromeProfileRole,
  type CreateChromeProfileInput,
  type ResetSubProfilesResult,
} from './chrome-profiles.types.js';

export class ChromeProfilesService {
  list(): { items: ChromeProfile[] } {
    return { items: chromeProfilesRepository.findAll() };
  }

  getById(id: string): ChromeProfile {
    const profile = chromeProfilesRepository.findById(id);
    if (!profile) {
      throw new AppError('Chrome profile not found', 404, 'NOT_FOUND');
    }
    return profile;
  }

  pickSubProfile(): ChromeProfile {
    return this.pickSubProfiles(1)[0];
  }

  listMainProfiles(): ChromeProfile[] {
    const mains = chromeProfilesRepository.findByRole('main');
    if (mains.length === 0) {
      throw new AppError(
        'No main Chrome profile configured. Set a profile as main first.',
        409,
        'NO_MAIN_PROFILE',
      );
    }
    return mains;
  }

  requireMainProfile(): ChromeProfile {
    return this.listMainProfiles()[0];
  }

  pickSubProfiles(count: number): ChromeProfile[] {
    const subs = chromeProfilesRepository.findByRole('sub');
    if (subs.length === 0) {
      throw new AppError(
        'No sub Chrome profile available. Create sub profiles first.',
        409,
        'NO_SUB_PROFILE',
      );
    }
    if (count > subs.length) {
      throw new AppError(
        `Need at least ${count} sub Chrome profile(s), but only ${subs.length} available.`,
        409,
        'NO_SUB_PROFILE',
      );
    }
    return subs.slice(0, count);
  }

  async create(input: CreateChromeProfileInput): Promise<ChromeProfile> {
    return this.createProfile(input.name.trim(), 'sub', 'prepend');
  }

  private async createProfile(
    name: string,
    role: ChromeProfileRole,
    position: 'prepend' | 'append',
  ): Promise<ChromeProfile> {
    if (chromeProfilesRepository.findByName(name)) {
      throw new AppError('Chrome profile name already exists', 400, 'DUPLICATE_NAME');
    }

    const id = generateId();
    const userDataDir = chromeProfileDir(id);

    await initializeChromeProfile(userDataDir);

    const profile: ChromeProfile = {
      id,
      name,
      userDataDir,
      createdAt: new Date().toISOString(),
      role,
    };

    return position === 'prepend'
      ? chromeProfilesRepository.prepend(profile)
      : chromeProfilesRepository.append(profile);
  }

  async open(id: string): Promise<ChromeProfile> {
    const profile = this.getById(id);
    await openChromeProfile(profile.id, profile.userDataDir);
    return profile;
  }

  setAsMain(id: string): ChromeProfile {
    return this.setRole(id, 'main');
  }

  setAsSub(id: string): ChromeProfile {
    return this.setRole(id, 'sub');
  }

  private setRole(id: string, role: ChromeProfileRole): ChromeProfile {
    this.getById(id);
    const profile = chromeProfilesRepository.setProfileRole(id, role);
    if (!profile) {
      throw new AppError('Chrome profile not found', 404, 'NOT_FOUND');
    }
    return profile;
  }

  async closeSubProfiles(profileIds: string[]): Promise<void> {
    if (profileIds.length === 0) return;

    const uniqueIds = [...new Set(profileIds)];
    const names = uniqueIds.map(id => this.getById(id).name);
    console.log(`[chrome-profile] đóng ${uniqueIds.length} profile (${names.join(', ')})...`);

    const closedIds = await closeChromeProfiles(uniqueIds);
    const closedNames = closedIds.map(id => this.getById(id).name);

    if (closedNames.length > 0) {
      console.log(`[chrome-profile] đã đóng: ${closedNames.join(', ')}`);
    }

    const skipped = uniqueIds.filter(id => !closedIds.includes(id));
    if (skipped.length > 0) {
      const skippedNames = skipped.map(id => this.getById(id).name);
      console.log(`[chrome-profile] không mở / đã đóng trước đó: ${skippedNames.join(', ')}`);
    }
  }

  async closeAllSubProfiles(): Promise<void> {
    const subs = chromeProfilesRepository.findByRole('sub');
    if (subs.length === 0) return;
    await this.closeSubProfiles(subs.map(profile => profile.id));
  }

  async resetSubProfiles(): Promise<ResetSubProfilesResult> {
    const subs = chromeProfilesRepository.findByRole('sub');
    let deletedCount = 0;

    if (subs.length > 0) {
      await closeChromeProfiles(subs.map((profile) => profile.id));
      const removed = chromeProfilesRepository.removeByIds(subs.map((profile) => profile.id));
      deletedCount = removed.length;

      for (const profile of removed) {
        await fs.rm(profile.userDataDir, { recursive: true, force: true });
      }
    }

    const items: ChromeProfile[] = [];
    for (let i = 1; i <= SUB_PROFILE_COUNT; i += 1) {
      const profile = await this.createProfile(`sub ${i}`, 'sub', 'append');
      items.push(profile);
    }

    return { deletedCount, items };
  }
}

export const chromeProfilesService = new ChromeProfilesService();
