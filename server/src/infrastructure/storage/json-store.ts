import fs from 'node:fs';
import path from 'node:path';

export function readJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

export function writeJson<T>(filePath: string, data: T): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempPath, filePath);
}

export function updateJson<T>(filePath: string, updater: (current: T) => T, fallback: T): T {
  const current = readJson<T>(filePath) ?? fallback;
  const next = updater(current);
  writeJson(filePath, next);
  return next;
}
