import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../../shared/http/errors.js';
import { closeChromeProfile } from '../../chrome-profiles/chrome-profile.runner.js';
import { chromeProfilesService } from '../../chrome-profiles/chrome-profiles.service.js';
import { isMetaProfileQuotaExhausted, isMetaQuotaExhaustedError } from './meta-quota.js';
import { metaBrowserService } from './meta.service.js';

/** One clip: animate `imagePath` with `prompt`, saved as `${name}.mp4` in the batch's output folder. */
export interface MetaImageToVideoJob {
  name: string;
  imagePath: string;
  prompt: string;
}

export interface MetaGenerateVideosResult {
  savedNames: string[];
  /** Clips Meta could not make; those scenes keep their image. */
  failed: { name: string; reason: string }[];
}

export interface MetaGenerateVideosOptions {
  outputDir: string;
  onLog?: (msg: string) => void;
  /** After each clip, saved or failed. */
  onProgress?: (done: number, total: number, name: string, ok: boolean) => void;
}

/** Meta AI video takes a few minutes; give each clip room before giving up on it. */
const META_CLIP_TIMEOUT_MS = 10 * 60_000;

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
 * Animate scene images into clips with Meta AI, one at a time. Meta has no LLM Video option on Chrome
 * profiles (a Meta login is the same account), so the profiles with Meta ticked in LLM Image are used,
 * in order; when one runs out of Meta quota the next takes over. The prompt is sent as
 * "Create video 16:9 …" with the scene image attached. Clips already on disk are skipped. Meta picks the
 * clip length itself; assembly cuts a longer clip to its scene and holds the last frame of a shorter one.
 */
export async function generateVideosFromImagesWithMeta(
  jobs: MetaImageToVideoJob[],
  options: MetaGenerateVideosOptions,
): Promise<MetaGenerateVideosResult> {
  const log = options.onLog ?? ((msg: string) => console.log(msg));
  const outputDir = path.resolve(options.outputDir);
  const profiles = chromeProfilesService.listProfilesForLlm('image', 'meta');
  if (profiles.length === 0) {
    throw new AppError(
      'No Chrome profile has Meta selected in LLM Image. Tick it on the Chrome profiles screen for a profile logged into Meta AI.',
      409,
      'NO_LLM_PROFILE',
    );
  }

  const failed: { name: string; reason: string }[] = [];
  const opened = new Set<string>();
  let profileIndex = 0;
  let done = 0;

  const nextUsableProfile = () => {
    while (profileIndex < profiles.length && isMetaProfileQuotaExhausted(profiles[profileIndex]!.id)) profileIndex += 1;
    return profiles[profileIndex];
  };

  try {
    for (const job of jobs) {
      if (await exists(path.join(outputDir, `${job.name}.mp4`))) {
        done += 1;
        continue;
      }

      let ok = false;
      for (;;) {
        const profile = nextUsableProfile();
        if (!profile) {
          failed.push({ name: job.name, reason: 'Every Meta profile is out of quota' });
          break;
        }
        opened.add(profile.id);
        try {
          log(`[meta-video] ${profile.name}: clip ${job.name} (${done + 1}/${jobs.length})`);
          await metaBrowserService.generateMedia(profile.id, job.prompt, {
            mediaKind: 'video',
            referenceImagePaths: [job.imagePath],
            outputDir,
            fileName: `${job.name}.mp4`,
            debugScreenshotPath: path.join(outputDir, `${job.name}-meta-debug.png`),
            timeoutMs: META_CLIP_TIMEOUT_MS,
          });
          ok = await exists(path.join(outputDir, `${job.name}.mp4`));
          if (!ok) failed.push({ name: job.name, reason: 'Meta returned no video file' });
          break;
        } catch (err) {
          if (isMetaQuotaExhaustedError(err)) {
            log(`[meta-video] ${profile.name} is out of Meta quota - trying the next Meta profile`);
            await closeChromeProfile(profile.id).catch(() => undefined);
            profileIndex += 1;
            continue;
          }
          failed.push({ name: job.name, reason: reasonOf(err) });
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
