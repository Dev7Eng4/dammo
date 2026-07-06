import fs from 'node:fs/promises';
import { AppError } from '../../shared/http/errors.js';

export interface SrtBlock {
  index: number;
  start: string;
  end: string;
  text: string;
}

const INDEXED_LINE_RE = /^\[(\d+)\]\s*(.*)$/;

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```[\w]*\n?/gm, '')
    .replace(/\n?```$/gm, '')
    .trim();
}

export function parseSrt(content: string): SrtBlock[] {
  const normalized = content.replace(/\r/g, '').trim();
  if (!normalized) return [];

  const rawBlocks = normalized.split(/\n\n+/).map(block => block.trim()).filter(Boolean);
  const blocks: SrtBlock[] = [];

  for (const raw of rawBlocks) {
    const lines = raw.split('\n');
    if (lines.length < 3) continue;

    const index = Number(lines[0].trim());
    if (!Number.isFinite(index)) continue;

    const timeLine = lines[1].trim();
    const timeParts = timeLine.split('-->').map(part => part.trim());
    if (timeParts.length !== 2) continue;

    blocks.push({
      index,
      start: timeParts[0],
      end: timeParts[1],
      text: lines.slice(2).join('\n').trim(),
    });
  }

  return blocks;
}

export function srtBlocksToIndexedText(blocks: SrtBlock[]): string {
  return blocks.map(block => `[${block.index}] ${block.text}`).join('\n');
}

export function parseIndexedTranscriptResponse(text: string): Map<number, string> {
  const cleaned = stripMarkdownFences(text);
  const corrections = new Map<number, string>();

  for (const line of cleaned.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(INDEXED_LINE_RE);
    if (!match) continue;

    const index = Number(match[1]);
    if (!Number.isFinite(index)) continue;

    corrections.set(index, match[2].trim());
  }

  return corrections;
}

export function chunkSrtBlocks(blocks: SrtBlock[], size = 80): SrtBlock[][] {
  if (size <= 0) return [blocks];
  const batches: SrtBlock[][] = [];
  for (let i = 0; i < blocks.length; i += size) {
    batches.push(blocks.slice(i, i + size));
  }
  return batches;
}

export function chunkSrtBlocksForMeta(blocks: SrtBlock[], size = 150, minLastBatch = 70): SrtBlock[][] {
  const batches = chunkSrtBlocks(blocks, size);
  if (batches.length > 1 && batches[batches.length - 1].length < minLastBatch) {
    const last = batches.pop()!;
    batches[batches.length - 1] = [...batches[batches.length - 1], ...last];
  }
  return batches;
}

export function resolvePreviousContext(allBlocks: SrtBlock[], batchBlocks: SrtBlock[], overlap = 10): string {
  if (batchBlocks.length === 0) return '';
  const firstIndex = batchBlocks[0].index;
  const prior = allBlocks.filter(block => block.index < firstIndex).slice(-overlap);
  return prior.length > 0 ? srtBlocksToIndexedText(prior) : '';
}

export function tryApplyIndexedCorrections(
  blocks: SrtBlock[],
  corrections: Map<number, string>,
): SrtBlock[] | null {
  if (corrections.size === 0 || corrections.size !== blocks.length) {
    return null;
  }

  const updated: SrtBlock[] = [];
  for (const block of blocks) {
    const corrected = corrections.get(block.index);
    if (corrected === undefined) {
      return null;
    }
    updated.push({ ...block, text: corrected });
  }

  return updated;
}

export function applyIndexedCorrections(
  blocks: SrtBlock[],
  corrections: Map<number, string>,
): SrtBlock[] {
  if (corrections.size !== blocks.length) {
    throw new AppError(
      `LLM returned ${corrections.size} lines but SRT has ${blocks.length} blocks`,
      502,
      'TRANSCRIPT_UPDATE_MISMATCH',
    );
  }

  return blocks.map(block => {
    const corrected = corrections.get(block.index);
    if (corrected === undefined) {
      throw new AppError(
        `LLM response missing correction for block [${block.index}]`,
        502,
        'TRANSCRIPT_UPDATE_MISMATCH',
      );
    }
    return { ...block, text: corrected };
  });
}

export function serializeSrt(blocks: SrtBlock[]): string {
  return blocks
    .map(block => `${block.index}\n${block.start} --> ${block.end}\n${block.text}`)
    .join('\n\n')
    .concat('\n');
}

export function srtTimestampToMs(timestamp: string): number {
  const match = timestamp.trim().match(/^(\d+):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!match) return 0;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = Number(match[4]);

  if (![hours, minutes, seconds, millis].every(Number.isFinite)) return 0;

  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
}

export function filterSrtBlocksByMaxDuration(blocks: SrtBlock[], maxMs: number): SrtBlock[] {
  if (maxMs <= 0) return [];
  return blocks.filter(block => srtTimestampToMs(block.start) < maxMs);
}

export async function extractTranscriptForMetadata(
  srtPath: string,
  maxMinutes = 25,
): Promise<string> {
  const content = await fs.readFile(srtPath, 'utf8');
  const blocks = parseSrt(content);
  const maxMs = maxMinutes * 60 * 1000;
  const filtered = filterSrtBlocksByMaxDuration(blocks, maxMs);

  if (filtered.length === 0) {
    throw new AppError(`No SRT blocks found within first ${maxMinutes} minutes`, 400, 'INVALID_INPUT');
  }

  return srtBlocksToIndexedText(filtered);
}
