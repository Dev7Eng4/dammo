import fs from 'node:fs';
import path from 'node:path';

const THUMBNAIL_BASENAME = 'thumbnail';
const OLD_THUMBNAIL_BASENAME = 'old-thumbnail';

export interface FindThumbnailPathOptions {
  allowOldThumbnail?: boolean;
}

export function findThumbnailPath(
  folderPath: string,
  options: FindThumbnailPathOptions = {},
): string | null {
  const files = fs.readdirSync(folderPath);
  const basenames = options.allowOldThumbnail
    ? [THUMBNAIL_BASENAME, OLD_THUMBNAIL_BASENAME]
    : [THUMBNAIL_BASENAME];

  for (const basename of basenames) {
    const matches = files.filter(file => {
      const ext = path.extname(file);
      if (!ext) return false;
      return path.basename(file, ext).toLowerCase() === basename;
    });

    if (matches.length > 0) {
      matches.sort((a, b) => a.localeCompare(b));
      return path.join(folderPath, matches[0]!);
    }
  }

  return null;
}

export function findOldThumbnailPath(folderPath: string): string | null {
  const files = fs.readdirSync(folderPath);
  const matches = files.filter(file => {
    const ext = path.extname(file);
    if (!ext) return false;
    return path.basename(file, ext).toLowerCase() === OLD_THUMBNAIL_BASENAME;
  });
  matches.sort((a, b) => a.localeCompare(b));
  return matches[0] ? path.join(folderPath, matches[0]) : null;
}
