import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TRANSCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Cue index line, e.g. `12` */
const INDEX_RE = /^\d+$/;
/** Timeline line, e.g. `00:00:01,480 --> 00:00:06,799` */
const TIMESTAMP_RE =
  /^\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/;

/**
 * Strip SRT index numbers, timestamps, and blank lines — keep cue text only.
 */
export function srtToPlainText(srtContent: string): string {
  return srtContent
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !INDEX_RE.test(line) && !TIMESTAMP_RE.test(line))
    .join('\n');
}

async function listSrtFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.srt'))
    .map(entry => path.join(dir, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

async function convertOne(inputPath: string): Promise<{ outputPath: string; lineCount: number }> {
  const raw = await fs.readFile(inputPath, 'utf8');
  const plain = srtToPlainText(raw);
  const outputPath = inputPath.replace(/\.srt$/i, '.txt');
  await fs.writeFile(outputPath, plain, 'utf8');
  const lineCount = plain ? plain.split('\n').length : 0;
  return { outputPath, lineCount };
}

async function main(): Promise<void> {
  const files = await listSrtFiles(TRANSCRIPTS_DIR);
  if (files.length === 0) {
    console.log(`[strip-srt] no .srt files in ${TRANSCRIPTS_DIR}`);
    return;
  }

  console.log(`[strip-srt] processing ${files.length} file(s) in ${TRANSCRIPTS_DIR}`);

  for (const inputPath of files) {
    const { outputPath, lineCount } = await convertOne(inputPath);
    console.log(
      `[strip-srt] ${path.basename(inputPath)} → ${path.basename(outputPath)} (${lineCount} lines)`,
    );
  }
}

main().catch(err => {
  console.error('[strip-srt] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
