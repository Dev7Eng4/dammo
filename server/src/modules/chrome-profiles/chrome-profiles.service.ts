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
    const subs = chromeProfilesRepository.findByRole('sub');
    if (subs.length === 0) {
      throw new AppError(
        'No sub Chrome profile available. Create sub profiles first.',
        409,
        'NO_SUB_PROFILE',
      );
    }
    const index = Math.floor(Math.random() * subs.length);
    return subs[index];
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
