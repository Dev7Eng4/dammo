import fs from 'node:fs/promises';
import path from 'node:path';

const THUMBNAIL_NAMES = ['old-thumbnail.jpg', 'thumbnail.jpg'];

export async function hasRequiredSourceAssets(dir: string): Promise<boolean> {
  try {
    await fs.access(path.join(dir, 'audio.mp3'));
  } catch {
    return false;
  }

  let hasThumbnail = false;
  for (const name of THUMBNAIL_NAMES) {
    try {
      await fs.access(path.join(dir, name));
      hasThumbnail = true;
      break;
    } catch {
      // try next
    }
  }
  if (!hasThumbnail) return false;

  const entries = await fs.readdir(dir);
  return entries.some(entry => entry.startsWith('transcript.') && entry.endsWith('.vtt'));
}

export async function copySourceAssetsToDir(sourceDir: string, destDir: string): Promise<void> {
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    await fs.copyFile(path.join(sourceDir, entry.name), path.join(destDir, entry.name));
  }
}

export async function findSourceTranscriptPath(dir: string): Promise<string | undefined> {
  const entries = await fs.readdir(dir);
  const vtt = entries.find(entry => entry.startsWith('transcript.') && entry.endsWith('.vtt'));
  return vtt ? path.join(dir, vtt) : undefined;
}

export async function findSourceThumbnailPath(dir: string): Promise<string | undefined> {
  for (const name of THUMBNAIL_NAMES) {
    const candidate = path.join(dir, name);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  return undefined;
}
