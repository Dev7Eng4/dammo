import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

const INPUT_FILE = 'transcript.srt';
const OUTPUT_FILE = 'transcript.txt';

/** Cue index line, e.g. `12` */
const INDEX_RE = /^\d+$/;
/** Timeline line, e.g. `00:00:01,480 --> 00:00:06,799` */
const TIMESTAMP_RE =
  /^\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/;

/**
 * Strip SRT index numbers, timelines, and blank lines — keep cue text only.
 */
export function srtToPlainText(srtContent: string): string {
  return srtContent
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !INDEX_RE.test(line) && !TIMESTAMP_RE.test(line))
    .join('\n');
}

/**
 * Read an `.srt` file and write plain transcript text (no index / timeline / blanks).
 */
export async function convertSrtToPlainText(
  inputPath: string,
  outputPath: string,
): Promise<{ lineCount: number; outputPath: string }> {
  const raw = await fs.readFile(inputPath, 'utf8');
  const plain = srtToPlainText(raw);
  await fs.writeFile(outputPath, plain, 'utf8');

  const lineCount = plain ? plain.split('\n').length : 0;
  return { lineCount, outputPath };
}

async function main(): Promise<void> {
  const inputPath = path.join(TEST_DIR, INPUT_FILE);
  const outputPath = path.join(TEST_DIR, OUTPUT_FILE);

  try {
    await fs.access(inputPath);
  } catch {
    throw new Error(`Missing input: ${inputPath}`);
  }

  const { lineCount } = await convertSrtToPlainText(inputPath, outputPath);
  console.log(`[convert-transcript] wrote ${lineCount} lines → ${outputPath}`);
}

main().catch((err) => {
  console.error('[convert-transcript] failed:', err);
  process.exitCode = 1;
});
