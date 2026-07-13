import fs from 'node:fs';
import path from 'node:path';

const THUMBNAIL_BASENAME = 'thumbnail';

export function findThumbnailPath(folderPath: string): string | null {
  const files = fs.readdirSync(folderPath);
  const matches = files.filter(file => {
    const ext = path.extname(file);
    if (!ext) return false;
    return path.basename(file, ext).toLowerCase() === THUMBNAIL_BASENAME;
  });

  if (matches.length === 0) return null;

  matches.sort((a, b) => a.localeCompare(b));
  return path.join(folderPath, matches[0]);
}
