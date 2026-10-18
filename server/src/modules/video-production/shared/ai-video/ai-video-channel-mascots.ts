import fs from 'node:fs/promises';
import path from 'node:path';
import { youtubeChannelDir } from '../../../../config/paths.js';
import { IMAGE_REFERENCES_DIRNAME } from './ai-video.constants.js';

/**
 * Channel mascot store: `<channel dir>/mascots/<characterId>.<ext>`.
 *
 * The store is opt-in per channel: it is active only when the `mascots` folder exists.
 * - Seed: before character images are generated, stored images are copied into the video's
 *   `image-references` so every video reuses the exact same file.
 * - Promote: images generated for ids the store does not hold yet are copied back into it.
 *   Delete a file from the store to make the next video generate (and store) a new one.
 */
export const CHANNEL_MASCOTS_DIRNAME = 'mascots';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const;

export function resolveChannelMascotsDir(channelId: string): string {
  return path.join(youtubeChannelDir(channelId), CHANNEL_MASCOTS_DIRNAME);
}

function toStoreFileBase(id: string): string {
  const sanitized = id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return sanitized || 'character';
}

async function isDirectory(dirPath: string): Promise<boolean> {
  try {
    return (await fs.stat(dirPath)).isDirectory();
  } catch {
    return false;
  }
}

async function findImageByBase(dir: string, base: string): Promise<string | undefined> {
  for (const ext of IMAGE_EXTENSIONS) {
    const candidate = path.join(dir, `${base}${ext}`);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next extension
    }
  }
  return undefined;
}

async function removeImagesByBase(dir: string, base: string): Promise<void> {
  for (const ext of IMAGE_EXTENSIONS) {
    await fs.rm(path.join(dir, `${base}${ext}`), { force: true });
  }
}

export async function isChannelMascotStoreEnabled(channelId: string | undefined): Promise<boolean> {
  const id = channelId?.trim();
  if (!id) return false;
  return isDirectory(resolveChannelMascotsDir(id));
}

export interface ChannelMascotSyncInput {
  channelId?: string;
  workDir: string;
  characterIds: string[];
  onLog?: (msg: string) => void;
}

/** Copy stored channel mascots into the video's `image-references`. Returns the ids that were seeded. */
export async function seedImageReferencesFromChannelMascots(input: ChannelMascotSyncInput): Promise<string[]> {
  const channelId = input.channelId?.trim();
  if (!channelId || !(await isChannelMascotStoreEnabled(channelId))) return [];

  const storeDir = resolveChannelMascotsDir(channelId);
  const imageDir = path.join(input.workDir, IMAGE_REFERENCES_DIRNAME);
  const seeded: string[] = [];

  for (const id of input.characterIds) {
    const base = toStoreFileBase(id);
    const stored = await findImageByBase(storeDir, base);
    if (!stored) continue;
    if (await findImageByBase(imageDir, base)) continue;

    await fs.mkdir(imageDir, { recursive: true });
    await fs.copyFile(stored, path.join(imageDir, `${base}${path.extname(stored).toLowerCase()}`));
    seeded.push(id);
  }

  if (seeded.length > 0) {
    input.onLog?.(`[ai-video] Channel mascots reused for ${seeded.length} character(s): ${seeded.join(', ')}`);
  }
  return seeded;
}

/** Copy generated images for ids missing from the store into it. Returns the ids that were promoted. */
export async function promoteImageReferencesToChannelMascots(input: ChannelMascotSyncInput): Promise<string[]> {
  const channelId = input.channelId?.trim();
  if (!channelId || !(await isChannelMascotStoreEnabled(channelId))) return [];

  const storeDir = resolveChannelMascotsDir(channelId);
  const imageDir = path.join(input.workDir, IMAGE_REFERENCES_DIRNAME);
  const promoted: string[] = [];

  for (const id of input.characterIds) {
    const base = toStoreFileBase(id);
    if (await findImageByBase(storeDir, base)) continue;
    const generated = await findImageByBase(imageDir, base);
    if (!generated) continue;

    await fs.copyFile(generated, path.join(storeDir, `${base}${path.extname(generated).toLowerCase()}`));
    promoted.push(id);
  }

  if (promoted.length > 0) {
    input.onLog?.(`[ai-video] Saved ${promoted.length} new image(s) to channel mascots: ${promoted.join(', ')}`);
  }
  return promoted;
}

/** Make an image the channel's canonical one for this id (replaces any stored file). No-op when the store is off. */
export async function saveChannelMascotImage(
  channelId: string | undefined,
  characterId: string,
  image: { buffer: Buffer; extension: string },
): Promise<boolean> {
  const id = channelId?.trim();
  if (!id || !(await isChannelMascotStoreEnabled(id))) return false;

  const storeDir = resolveChannelMascotsDir(id);
  const base = toStoreFileBase(characterId);
  await removeImagesByBase(storeDir, base);
  await fs.writeFile(path.join(storeDir, `${base}${image.extension}`), image.buffer);
  return true;
}
