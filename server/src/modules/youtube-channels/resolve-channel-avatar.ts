import fs from 'node:fs/promises';
import path from 'node:path';
import { youtubeChannelDir } from '../../config/paths.js';
import { CHANNEL_AVATAR_BASENAME } from '../video-production/shared/render-core/canvas.constants.js';

export async function resolveYoutubeChannelAvatarImagePath(channelId: string): Promise<string | null> {
  const dir = youtubeChannelDir(channelId);
  let entries: { name: string; isFile: () => boolean }[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  const candidates = entries
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .filter(name => path.parse(name).name.toLowerCase() === CHANNEL_AVATAR_BASENAME)
    .sort();

  if (candidates.length === 0) {
    return null;
  }

  const resolved = path.join(dir, candidates[0]!);
  try {
    await fs.access(resolved);
  } catch {
    return null;
  }

  return resolved;
}

export async function resolveChannelAvatarForVideoAssembly(
  channelId: string,
  options: { enabled?: boolean; onLog?: (msg: string) => void },
): Promise<string | undefined> {
  if (!options.enabled) {
    return undefined;
  }
  const avatarPath = await resolveYoutubeChannelAvatarImagePath(channelId);
  if (!avatarPath) {
    options.onLog?.('Channel avatar enabled but no avatar.* in channel folder — skipping overlay');
    return undefined;
  }
  return avatarPath;
}
