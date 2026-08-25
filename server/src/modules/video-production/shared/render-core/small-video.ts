import fs from 'node:fs/promises';
import path from 'node:path';
import { paths, smallVideoGroupDir } from '../../../../config/paths.js';
import { AppError } from '../../../../shared/http/errors.js';
import { isUuid } from '../../../../shared/id.js';
import { parseSmallVideoGroupId, OVERLAY_AUTO_SENTINEL } from './canvas.constants.js';

const SMALL_VIDEO_EXTENSIONS = new Set(['.mp4', '.mov']);

export interface SmallVideoClip {
  path: string;
  filename: string;
}

async function listVideoClipsInDir(dir: string): Promise<string[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter(
      (entry) => entry.isFile() && SMALL_VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()),
    )
    .map((entry) => entry.name)
    .sort();
}

export async function selectRandomSmallVideoClip(): Promise<SmallVideoClip> {
  const clips = await listVideoClipsInDir(paths.siSmallVideoDir);

  if (clips.length === 0) {
    throw new AppError('No small video assets found', 400, 'SI_SMALL_VIDEO_EMPTY');
  }

  const filename = clips[Math.floor(Math.random() * clips.length)]!;
  return {
    path: path.join(paths.siSmallVideoDir, filename),
    filename,
  };
}

export async function selectRandomSmallVideoClipFromGroup(groupId: string): Promise<SmallVideoClip> {
  if (!isUuid(groupId)) {
    throw new AppError(`Invalid small video group id: ${groupId}`, 400, 'INVALID_SMALL_VIDEO_GROUP');
  }

  const dir = smallVideoGroupDir(groupId);
  try {
    await fs.access(dir);
  } catch {
    throw new AppError(`Small video group not found: ${groupId}`, 400, 'SI_SMALL_VIDEO_GROUP_MISSING');
  }

  const clips = await listVideoClipsInDir(dir);
  if (clips.length === 0) {
    throw new AppError('Selected small video group has no clips', 400, 'SI_SMALL_VIDEO_GROUP_EMPTY');
  }

  const filename = clips[Math.floor(Math.random() * clips.length)]!;
  return {
    path: path.join(dir, filename),
    filename,
  };
}

export async function resolveSmallVideoClip(filename?: string): Promise<SmallVideoClip> {
  const selected = filename?.trim();
  if (!selected || selected === OVERLAY_AUTO_SENTINEL) {
    return selectRandomSmallVideoClip();
  }

  const groupId = parseSmallVideoGroupId(selected);
  if (groupId) {
    return selectRandomSmallVideoClipFromGroup(groupId);
  }

  const safeName = path.basename(selected);
  if (!SMALL_VIDEO_EXTENSIONS.has(path.extname(safeName).toLowerCase())) {
    throw new AppError(`Unsupported small video file type: ${safeName}`, 400, 'INVALID_SMALL_VIDEO');
  }

  const filePath = path.join(paths.siSmallVideoDir, safeName);
  try {
    await fs.access(filePath);
  } catch {
    throw new AppError(`Small video asset not found: ${safeName}`, 400, 'SI_SMALL_VIDEO_MISSING');
  }

  return { path: filePath, filename: safeName };
}
