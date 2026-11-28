import { chromeProfileDir } from '../../config/paths.js';
import { AppError } from '../../shared/http/errors.js';
import { generateId } from '../../shared/id.js';
import { closeChromeProfiles, initializeChromeProfile, openChromeProfile } from './chrome-profile.runner.js';
import { chromeProfilesRepository } from './chrome-profiles.repository.js';
import type {
  ChromeProfile,
  CreateChromeProfileInput,
  LlmByCapability,
  LlmCapability,
  LlmContent,
  UpdateChromeProfileInput,
  UpdateChromeProfileLlmsInput,
} from './chrome-profiles.types.js';

const CAPABILITY_FIELD = {
  content: 'llmContent',
  image: 'llmImage',
  video: 'llmVideo',
} as const satisfies Record<LlmCapability, keyof ChromeProfile>;

const CAPABILITY_LABEL: Record<LlmCapability, string> = {
  content: 'LLM Content',
  image: 'LLM Image',
  video: 'LLM Video',
};

const LLM_LABEL: Record<string, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  claude: 'Claude',
  meta: 'Meta',
  flow: 'Flow',
  muse: 'Muse',
};

/** Text-chat provider id used by the LLM browser (`gpt`, `gemini`, …) → content LLM on the profile. */
export function contentLlmForProvider(provider: string): LlmContent {
  if (provider === 'gpt' || provider === 'chatgpt') return 'chatgpt';
  if (provider === 'gemini') return 'gemini';
  if (provider === 'claude') return 'claude';
  throw new AppError(`Unknown text LLM provider: ${provider}`, 400, 'UNKNOWN_LLM_PROVIDER');
}

/** Whether the profile is ticked as logged into `llm` for `capability`. */
export function profileHasLlm<C extends LlmCapability>(
  profile: ChromeProfile,
  capability: C,
  llm: LlmByCapability[C],
): boolean {
  const list = profile[CAPABILITY_FIELD[capability]] as readonly string[] | undefined;
  return list?.includes(llm) ?? false;
}

/** Empty usageOrder first, then higher numbers before lower; name tie-break. */
export function compareProfilesByUsageOrder(a: ChromeProfile, b: ChromeProfile): number {
  const aOrder = a.usageOrder;
  const bOrder = b.usageOrder;
  const aHas = typeof aOrder === 'number';
  const bHas = typeof bOrder === 'number';
  if (!aHas && bHas) return -1;
  if (aHas && !bHas) return 1;
  if (aHas && bHas && aOrder !== bOrder) return bOrder - aOrder;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

function noProfileError(capability: LlmCapability, llm: string): AppError {
  return new AppError(
    `No Chrome profile has ${LLM_LABEL[llm] ?? llm} selected in ${CAPABILITY_LABEL[capability]}. ` +
      'Tick it on the Chrome profiles screen for a profile that is logged in.',
    409,
    'NO_LLM_PROFILE',
    { capability, llm },
  );
}

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

  /**
   * Profiles logged into `llm` for `capability`, in pick order (may be empty).
   * Flow profiles follow usageOrder (quota failover); others are by name.
   */
  listProfilesForLlm<C extends LlmCapability>(
    capability: C,
    llm: LlmByCapability[C],
    options?: { excludeIds?: readonly string[] },
  ): ChromeProfile[] {
    const exclude = new Set(options?.excludeIds ?? []);
    const profiles = chromeProfilesRepository
      .findAll()
      .filter(profile => !exclude.has(profile.id) && profileHasLlm(profile, capability, llm));
    return llm === 'flow' ? profiles.sort(compareProfilesByUsageOrder) : profiles;
  }

  /** Like {@link listProfilesForLlm} but throws `NO_LLM_PROFILE` when none is ticked. */
  requireProfilesForLlm<C extends LlmCapability>(capability: C, llm: LlmByCapability[C]): ChromeProfile[] {
    const profiles = this.listProfilesForLlm(capability, llm);
    if (profiles.length === 0) throw noProfileError(capability, llm);
    return profiles;
  }

  /** First profile in pick order for `llm`; throws `NO_LLM_PROFILE` when none is ticked. */
  requireProfileForLlm<C extends LlmCapability>(capability: C, llm: LlmByCapability[C]): ChromeProfile {
    return this.requireProfilesForLlm(capability, llm)[0]!;
  }

  /** Up to `count` profiles for `llm` (at least one); throws `NO_LLM_PROFILE` when none is ticked. */
  pickProfilesForLlm<C extends LlmCapability>(capability: C, llm: LlmByCapability[C], count: number): ChromeProfile[] {
    return this.requireProfilesForLlm(capability, llm).slice(0, Math.max(1, count));
  }

  /**
   * After a Flow daily quota/limit hit: set this profile's usageOrder to max(Flow profiles)+1,
   * so it is tried last next time.
   */
  markFlowProfileLimited(id: string): ChromeProfile {
    const profile = this.getById(id);
    const flowProfiles = chromeProfilesRepository
      .findAll()
      .filter(item => profileHasLlm(item, 'image', 'flow') || profileHasLlm(item, 'video', 'flow'));
    let maxOrder = 0;
    for (const item of flowProfiles) {
      if (typeof item.usageOrder === 'number' && item.usageOrder > maxOrder) {
        maxOrder = item.usageOrder;
      }
    }
    const nextOrder = maxOrder + 1;
    const updated = chromeProfilesRepository.setUsageOrder(id, nextOrder);
    if (!updated) {
      throw new AppError('Chrome profile not found', 404, 'NOT_FOUND');
    }
    console.log(
      `[chrome-profile] ${profile.name}: usageOrder ${profile.usageOrder ?? '(none)'} → ${nextOrder} (limit)`,
    );
    return updated;
  }

  async create(input: CreateChromeProfileInput): Promise<ChromeProfile> {
    const name = input.name.trim();
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
    };

    return chromeProfilesRepository.prepend(profile);
  }

  update(id: string, input: UpdateChromeProfileInput): ChromeProfile {
    this.getById(id);
    const name = input.name.trim();
    const existing = chromeProfilesRepository.findByName(name);
    if (existing && existing.id !== id) {
      throw new AppError('Chrome profile name already exists', 400, 'DUPLICATE_NAME');
    }

    const profile = chromeProfilesRepository.updateName(id, name);
    if (!profile) {
      throw new AppError('Chrome profile not found', 404, 'NOT_FOUND');
    }
    return profile;
  }

  updateLlms(id: string, input: UpdateChromeProfileLlmsInput): ChromeProfile {
    this.getById(id);
    const profile = chromeProfilesRepository.updateLlms(id, input);
    if (!profile) {
      throw new AppError('Chrome profile not found', 404, 'NOT_FOUND');
    }
    return profile;
  }

  async open(id: string): Promise<ChromeProfile> {
    const profile = this.getById(id);
    await openChromeProfile(profile.id, profile.userDataDir);
    return profile;
  }

  /** Close the given profiles' browsers (ones not open are skipped). */
  async closeProfiles(profileIds: string[]): Promise<void> {
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
}

export const chromeProfilesService = new ChromeProfilesService();
