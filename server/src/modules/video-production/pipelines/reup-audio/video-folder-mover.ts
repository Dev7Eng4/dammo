import fs from 'node:fs/promises';
import path from 'node:path';
import { mediaDownloadDir } from '../../../../config/paths.js';
import type { ReupVideoOutputItem } from './reup-audio.types.js';

function isPathInsideDir(filePath: string, dirPath: string): boolean {
  const resolvedFile = path.resolve(filePath);
  const resolvedDir = path.resolve(dirPath);
  const relative = path.relative(resolvedDir, resolvedFile);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function remapFilePath(filePath: string | undefined, oldDir: string, newDir: string): string | undefined {
  if (!filePath) return undefined;
  if (!isPathInsideDir(filePath, oldDir)) return filePath;
  return path.join(newDir, path.relative(path.resolve(oldDir), path.resolve(filePath)));
}

export function remapOutputItemPaths(item: ReupVideoOutputItem, oldDir: string, newDir: string): ReupVideoOutputItem {
  if (path.resolve(oldDir) === path.resolve(newDir)) {
    return item;
  }

  return {
    ...item,
    outputPath: remapFilePath(item.outputPath, oldDir, newDir) ?? item.outputPath,
    thumbnailPath: remapFilePath(item.thumbnailPath, oldDir, newDir),
    audioPath: remapFilePath(item.audioPath, oldDir, newDir),
    transcriptPath: remapFilePath(item.transcriptPath, oldDir, newDir),
    srtPath: remapFilePath(item.srtPath, oldDir, newDir),
    updatedSrtPath: remapFilePath(item.updatedSrtPath, oldDir, newDir),
    heroImagePath: remapFilePath(item.heroImagePath, oldDir, newDir),
    thumbnailVisualPath: remapFilePath(item.thumbnailVisualPath, oldDir, newDir),
    reupThumbnailPath: remapFilePath(item.reupThumbnailPath, oldDir, newDir),
    reupVideoPath: remapFilePath(item.reupVideoPath, oldDir, newDir),
    videoPath: remapFilePath(item.videoPath, oldDir, newDir),
  };
}

async function copyDirRecursive(source: string, destination: string): Promise<void> {
  await fs.mkdir(destination, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      await copyDirRecursive(sourcePath, destPath);
      continue;
    }

    await fs.copyFile(sourcePath, destPath);
  }
}

export async function moveVideoFolderToDestination(
  stagingPlatform: string,
  mediaId: string,
  destDir: string,
): Promise<string> {
  const sourceDir = mediaDownloadDir(stagingPlatform, mediaId);

  try {
    await fs.access(sourceDir);
  } catch {
    console.warn(`[reup-video] skip move: source folder not found → ${sourceDir}`);
    return sourceDir;
  }

  await fs.mkdir(path.dirname(destDir), { recursive: true });

  try {
    await fs.access(destDir);
    await fs.rm(destDir, { recursive: true, force: true });
  } catch {
    // Destination does not exist yet.
  }

  try {
    await fs.rename(sourceDir, destDir);
  } catch {
    await copyDirRecursive(sourceDir, destDir);
    await fs.rm(sourceDir, { recursive: true, force: true });
  }

  console.log(`[reup-video] moved → ${destDir}`);
  return destDir;
}
