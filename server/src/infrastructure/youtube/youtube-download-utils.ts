import fs from 'node:fs/promises';
import path from 'node:path';

export async function findFileByPrefix(dir: string, prefix: string): Promise<string | null> {
  const files = await fs.readdir(dir);
  const match = files.find((file) => file.startsWith(prefix));
  return match ? path.join(dir, match) : null;
}

export async function findFileByExtension(dir: string, extensions: string[]): Promise<string | null> {
  const files = await fs.readdir(dir);
  const match = files.find((file) => extensions.some((ext) => file.endsWith(ext)));
  return match ? path.join(dir, match) : null;
}

export async function findSubtitleFile(dir: string, language: string): Promise<string | null> {
  const files = await fs.readdir(dir);
  const lang = language.toLowerCase();
  const patterns = [
    (file: string) => file.endsWith('.vtt') && file.toLowerCase().includes(lang),
    (file: string) => file.endsWith('.srt') && file.toLowerCase().includes(lang),
    (file: string) => file.endsWith('.vtt'),
    (file: string) => file.endsWith('.srt'),
  ];

  for (const pattern of patterns) {
    const match = files.find(pattern);
    if (match) return path.join(dir, match);
  }

  return null;
}

export async function renameToCanonical(sourcePath: string, targetPath: string): Promise<string> {
  if (sourcePath === targetPath) return targetPath;
  await fs.rename(sourcePath, targetPath);
  return targetPath;
}
