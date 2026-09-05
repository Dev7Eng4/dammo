import fs from 'node:fs/promises';
import path from 'node:path';
import { isFlowDailyQuotaError, isFlowPolicyViolationError, isFlowProfileSwitchError } from '../../infrastructure/llm-browser/flow-api-errors.js';
import type {
  FlowGenerateImageOptions,
  FlowGenerateImagesViaToolOptions,
  FlowToolVisual,
  LlmBrowserResponse,
  LlmMediaAsset,
} from '../../infrastructure/llm-browser/llm-browser.types.js';
import { AppError } from '../../shared/http/errors.js';
import { closeChromeProfile } from '../chrome-profiles/chrome-profile.runner.js';
import { chromeProfilesService } from '../chrome-profiles/chrome-profiles.service.js';
import type { ChromeProfile } from '../chrome-profiles/chrome-profiles.types.js';
import { flowBrowserService } from './flow-browser.service.js';

export interface FlowProfileFailoverOptions {
  startProfileId?: string;
  /** Collects every main profile ID used during failover (for batch cleanup). */
  openedProfileIds?: Set<string>;
  onProfileSwitch?: (from: ChromeProfile, to: ChromeProfile, remainingCount: number) => void;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function listAvailableFlowMainProfiles(exhaustedProfileIds: Set<string>): ChromeProfile[] {
  return chromeProfilesService
    .listMainProfiles()
    .filter(profile => !exhaustedProfileIds.has(profile.id))
    .sort((a, b) => {
      const aOrder = a.usageOrder;
      const bOrder = b.usageOrder;
      const aHas = typeof aOrder === 'number';
      const bHas = typeof bOrder === 'number';
      if (!aHas && bHas) return -1;
      if (aHas && !bHas) return 1;
      if (aHas && bHas && aOrder !== bOrder) return bOrder - aOrder;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
}

function pickStartProfile(startProfileId: string | undefined, exhausted: Set<string>): ChromeProfile {
  const available = listAvailableFlowMainProfiles(exhausted);
  if (available.length === 0) {
    throw new AppError('No Chrome main profiles available for Flow', 409, 'NO_MAIN_PROFILE');
  }

  if (startProfileId) {
    const preferred = available.find(profile => profile.id === startProfileId);
    if (preferred) return preferred;
  }

  return available[0];
}

async function resolvePendingVisuals(
  visuals: FlowToolVisual[],
  outputDir: string,
): Promise<FlowToolVisual[]> {
  const pending: FlowToolVisual[] = [];
  for (const visual of visuals) {
    const outputPath = path.join(outputDir, `${visual.name}.jpg`);
    if (await fileExists(outputPath)) continue;
    pending.push(visual);
  }
  return pending;
}

async function collectExistingAssets(
  visuals: FlowToolVisual[],
  outputDir: string,
): Promise<LlmMediaAsset[]> {
  const assets: LlmMediaAsset[] = [];
  for (const visual of visuals) {
    const localPath = path.join(outputDir, `${visual.name}.jpg`);
    if (await fileExists(localPath)) {
      assets.push({ kind: 'image', localPath });
    }
  }
  return assets;
}

/**
 * Generate tool-batch images, switching to the next Chrome main profile when
 * daily Flow quota is exhausted. Only retries visuals whose output file is missing.
 */
export async function generateImagesViaToolWithFailover(
  visuals: FlowToolVisual[],
  options: FlowGenerateImagesViaToolOptions,
  failoverOpts?: FlowProfileFailoverOptions,
): Promise<LlmBrowserResponse> {
  if (visuals.length === 0) {
    throw new AppError('generateImagesViaToolWithFailover requires at least one visual', 400, 'INVALID_INPUT');
  }

  const outputDir = path.resolve(options.outputDir);
  const exhausted = new Set<string>();
  let profile = pickStartProfile(failoverOpts?.startProfileId, exhausted);
  const startedAt = Date.now();
  const triedNames: string[] = [];

  while (true) {
    const pending = await resolvePendingVisuals(visuals, outputDir);
    if (pending.length === 0) {
      const mediaAssets = await collectExistingAssets(visuals, outputDir);
      return {
        provider: 'flow',
        content: '',
        codeBlocks: [],
        elapsedMs: Date.now() - startedAt,
        mediaAssets,
      };
    }

    failoverOpts?.openedProfileIds?.add(profile.id);

    console.log(
      `[flow-quota] using profile ${profile.name} (${profile.id}), ${pending.length} image(s) remaining`,
    );

    try {
      const response = await flowBrowserService.generateImagesViaTool(profile.id, pending, options);
      const mediaAssets = await collectExistingAssets(visuals, outputDir);
      return {
        ...response,
        elapsedMs: Date.now() - startedAt,
        mediaAssets: mediaAssets.length > 0 ? mediaAssets : response.mediaAssets,
      };
    } catch (err) {
      if (isFlowPolicyViolationError(err)) {
        console.warn(`[flow-policy] profile ${profile.name}: policy violation — closing, no profile switch`);
        await closeChromeProfile(profile.id).catch(() => undefined);
        throw err;
      }

      if (!isFlowProfileSwitchError(err)) {
        throw err;
      }

      const reason = isFlowDailyQuotaError(err) ? 'daily quota exhausted' : 'browser tile error';
      console.warn(`[flow-quota] profile ${profile.name} ${reason} — switching profile`);
      if (isFlowDailyQuotaError(err)) {
        chromeProfilesService.markMainProfileLimited(profile.id);
      }
      exhausted.add(profile.id);
      triedNames.push(profile.name);

      await closeChromeProfile(profile.id).catch(() => undefined);

      const nextProfiles = listAvailableFlowMainProfiles(exhausted);
      if (nextProfiles.length === 0) {
        const stillMissing = (await resolvePendingVisuals(visuals, outputDir)).map(v => v.name);
        console.error(
          `[flow-quota] all main profiles exhausted, missing: ${stillMissing.join(', ') || '(none)'}`,
        );
        throw new AppError(
          `Flow profile failover exhausted on all main profiles (${triedNames.join(', ')}). ` +
            `Missing images: ${stillMissing.join(', ') || '(none)'}`,
          isFlowDailyQuotaError(err) ? 429 : 502,
          isFlowDailyQuotaError(err) ? 'FLOW_DAILY_QUOTA_EXHAUSTED' : 'FLOW_BROWSER_TILE_ERROR',
        );
      }

      const from = profile;
      profile = nextProfiles[0];
      const remaining = (await resolvePendingVisuals(visuals, outputDir)).length;
      console.log(
        `[flow-quota] switching to profile ${profile.name}, ${remaining} image(s) remaining`,
      );
      failoverOpts?.onProfileSwitch?.(from, profile, remaining);
    }
  }
}

/**
 * Generate a single Flow image with main-profile failover on daily quota exhaustion.
 */
export async function generateImageWithFailover(
  prompt: string,
  options?: FlowGenerateImageOptions,
  failoverOpts?: FlowProfileFailoverOptions,
): Promise<LlmBrowserResponse> {
  const exhausted = new Set<string>();
  let profile = pickStartProfile(failoverOpts?.startProfileId, exhausted);
  const triedNames: string[] = [];
  const startedAt = Date.now();

  while (true) {
    failoverOpts?.openedProfileIds?.add(profile.id);

    console.log(`[flow-quota] using profile ${profile.name} (${profile.id}) for single image`);

    try {
      const response = await flowBrowserService.generateImage(profile.id, prompt, options);
      return {
        ...response,
        elapsedMs: Date.now() - startedAt,
      };
    } catch (err) {
      if (isFlowPolicyViolationError(err)) {
        console.warn(`[flow-policy] profile ${profile.name}: policy violation — closing, no profile switch`);
        await closeChromeProfile(profile.id).catch(() => undefined);
        throw err;
      }

      if (!isFlowProfileSwitchError(err)) {
        throw err;
      }

      const reason = isFlowDailyQuotaError(err) ? 'daily quota exhausted' : 'browser tile error';
      console.warn(`[flow-quota] profile ${profile.name} ${reason} — switching profile`);
      if (isFlowDailyQuotaError(err)) {
        chromeProfilesService.markMainProfileLimited(profile.id);
      }
      exhausted.add(profile.id);
      triedNames.push(profile.name);

      await closeChromeProfile(profile.id).catch(() => undefined);

      const nextProfiles = listAvailableFlowMainProfiles(exhausted);
      if (nextProfiles.length === 0) {
        console.error(`[flow-quota] all main profiles exhausted: ${triedNames.join(', ')}`);
        throw new AppError(
          `Flow profile failover exhausted on all main profiles (${triedNames.join(', ')})`,
          isFlowDailyQuotaError(err) ? 429 : 502,
          isFlowDailyQuotaError(err) ? 'FLOW_DAILY_QUOTA_EXHAUSTED' : 'FLOW_BROWSER_TILE_ERROR',
        );
      }

      const from = profile;
      profile = nextProfiles[0];
      console.log(`[flow-quota] switching to profile ${profile.name}, 1 image remaining`);
      failoverOpts?.onProfileSwitch?.(from, profile, 1);
    }
  }
}
