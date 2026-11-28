import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError, isAppError } from '../../../shared/http/errors.js';
import { closeChromeProfile } from '../../chrome-profiles/chrome-profile.runner.js';
import { chromeProfilesService } from '../../chrome-profiles/chrome-profiles.service.js';
import type { ChromeProfile } from '../../chrome-profiles/chrome-profiles.types.js';
import { museBrowserService } from './muse.service.js';

/** One clip: animate `imagePath` with `prompt`, saved as `${name}.mp4` in the batch's output folder. */
export interface MuseImageToVideoJob {
  name: string;
  imagePath: string;
  prompt: string;
  /** Clip length in seconds; Muse makes 3–10 s (clamped). */
  lengthSec?: number;
}

export interface MuseGenerateVideosResult {
  savedNames: string[];
  /** Clips Muse could not make; those scenes keep their image. */
  failed: { name: string; reason: string }[];
}

export interface MuseGenerateVideosOptions {
  outputDir: string;
  /** Tries per clip, each in a new side chat. Default 2. */
  maxAttempts?: number;
  onLog?: (msg: string) => void;
  /** After each clip, saved or failed. */
  onProgress?: (done: number, total: number, name: string, ok: boolean) => void;
}

async function exists(filePath: string): Promise<boolean> {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Animate scene images into clips with Muse, one at a time on the first Chrome profile with Muse ticked in
 * LLM Video (the next one takes over when a profile is not logged in). Clips already on disk are skipped.
 * When Muse says its video service is down, the remaining clips are not tried: they keep their image.
 */
export async function generateVideosFromImagesWithMuse(
  jobs: MuseImageToVideoJob[],
  options: MuseGenerateVideosOptions,
): Promise<MuseGenerateVideosResult> {
  const log = options.onLog ?? ((msg: string) => console.log(msg));
  const outputDir = path.resolve(options.outputDir);
  const profiles = chromeProfilesService.listProfilesForLlm('video', 'muse');
  if (profiles.length === 0) {
    throw new AppError(
      'No Chrome profile has Muse selected in LLM Video. Tick it on the Chrome profiles screen for a profile logged into muse.ai.',
      409,
      'NO_LLM_PROFILE',
    );
  }

  const failed: { name: string; reason: string }[] = [];
  const opened = new Set<string>();
  let profileIndex = 0;
  let serviceDown: string | undefined;
  let done = 0;

  try {
    for (const job of jobs) {
      if (await exists(path.join(outputDir, `${job.name}.mp4`))) {
        done += 1;
        continue;
      }
      if (serviceDown) {
        failed.push({ name: job.name, reason: serviceDown });
        done += 1;
        options.onProgress?.(done, jobs.length, job.name, false);
        continue;
      }

      let ok = false;
      while (!ok) {
        const profile: ChromeProfile | undefined = profiles[profileIndex];
        if (!profile) throw new AppError('No Muse Chrome profile is logged into muse.ai', 401, 'MUSE_NOT_LOGGED_IN');
        opened.add(profile.id);
        try {
          log(`[muse] ${profile.name}: clip ${job.name} (${done + 1}/${jobs.length})`);
          await museBrowserService.generateVideo(job.prompt, {
            profileId: profile.id,
            referenceImagePaths: [job.imagePath],
            durationSeconds: job.lengthSec,
            outputDir,
            fileName: job.name,
            maxAttempts: options.maxAttempts ?? 2,
            onLog: log,
          });
          ok = true;
        } catch (err) {
          if (isAppError(err) && err.code === 'MUSE_NOT_LOGGED_IN') {
            log(`[muse] ${profile.name} is not logged into muse.ai - trying the next Muse profile`);
            await closeChromeProfile(profile.id).catch(() => undefined);
            profileIndex += 1;
            continue;
          }
          const reason = reasonOf(err);
          failed.push({ name: job.name, reason });
          if (isAppError(err) && err.code === 'MUSE_SERVICE_UNAVAILABLE') {
            serviceDown = `Muse video service unavailable: ${reason}`;
            log(`[muse] video service is down - the remaining clips keep their image`);
          }
          break;
        }
      }
      done += 1;
      options.onProgress?.(done, jobs.length, job.name, ok);
    }
  } finally {
    for (const id of opened) await closeChromeProfile(id).catch(() => undefined);
  }

  const savedNames: string[] = [];
  for (const job of jobs) {
    if (await exists(path.join(outputDir, `${job.name}.mp4`))) savedNames.push(job.name);
  }
  return { savedNames, failed };
}
