import type { Locator } from 'playwright';
import { META_CONFIG } from './meta.config.js';

export type MetaImageUrlKind = 'http' | 'blob' | 'data' | 'unsupported';

export interface MetaImageUrlCandidate {
  url: string;
  kind: MetaImageUrlKind;
  priority: number;
}

export interface ResolvedMetaImageUrl {
  url: string;
  kind: MetaImageUrlKind;
  candidateCount: number;
}

const HTTP_FBCDN_PRIORITY = 100;
const HTTP_SCONTENT_PRIORITY = 95;
const HTTP_OTHER_PRIORITY = 80;
const BLOB_PRIORITY = 10;

export function isHttpUrl(url: string): boolean {
  const trimmed = url.trim();
  return trimmed.startsWith('http://') || trimmed.startsWith('https://');
}

export function isBlobUrl(url: string): boolean {
  return url.trim().startsWith('blob:');
}

export function isDataUrl(url: string): boolean {
  return url.trim().startsWith('data:');
}

export function isIgnoredImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return true;
  if (trimmed.includes('favicon')) return true;
  return false;
}

export function classifyMetaImageUrl(url: string): MetaImageUrlKind {
  const trimmed = url.trim();
  if (!trimmed || isIgnoredImageUrl(trimmed)) return 'unsupported';
  if (isHttpUrl(trimmed)) return 'http';
  if (isBlobUrl(trimmed)) return 'blob';
  if (isDataUrl(trimmed)) return 'data';
  return 'unsupported';
}

function scoreHttpUrl(url: string): number {
  const lower = url.toLowerCase();
  if (lower.includes('fbcdn.net')) return HTTP_FBCDN_PRIORITY;
  if (lower.includes('scontent.')) return HTTP_SCONTENT_PRIORITY;
  return HTTP_OTHER_PRIORITY;
}

export function scoreMetaImageUrl(url: string): number {
  const kind = classifyMetaImageUrl(url);
  if (kind === 'http') return scoreHttpUrl(url);
  if (kind === 'blob') return BLOB_PRIORITY;
  return 0;
}

/** Parse srcset and return URLs ordered by declared width (descending). */
export function parseSrcsetUrls(srcset: string): string[] {
  const entries = srcset
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const [urlPart, descriptor] = part.split(/\s+/, 2);
      const widthMatch = descriptor?.match(/^(\d+)w$/);
      const width = widthMatch ? Number(widthMatch[1]) : 0;
      return { url: urlPart?.trim() ?? '', width };
    })
    .filter(entry => entry.url.length > 0 && !isIgnoredImageUrl(entry.url));

  entries.sort((a, b) => b.width - a.width);
  return entries.map(entry => entry.url);
}

export function collectImageUrlCandidates(
  src: string | null | undefined,
  srcset: string | null | undefined,
): MetaImageUrlCandidate[] {
  const seen = new Set<string>();
  const candidates: MetaImageUrlCandidate[] = [];

  const addUrl = (raw: string) => {
    const url = raw.trim();
    if (!url || seen.has(url)) return;
    const kind = classifyMetaImageUrl(url);
    if (kind === 'unsupported' || kind === 'data') return;
    seen.add(url);
    candidates.push({ url, kind, priority: scoreMetaImageUrl(url) });
  };

  if (src) addUrl(src);
  if (srcset) {
    for (const url of parseSrcsetUrls(srcset)) {
      addUrl(url);
    }
  }

  return candidates;
}

export function pickBestMetaImageUrl(
  candidates: MetaImageUrlCandidate[],
): MetaImageUrlCandidate | null {
  if (candidates.length === 0) return null;

  const sorted = [...candidates].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (a.kind === 'http' && b.kind !== 'http') return -1;
    if (b.kind === 'http' && a.kind !== 'http') return 1;
    return 0;
  });

  return sorted[0] ?? null;
}

export function pickBestMetaImageUrlFromInputs(
  inputs: Array<{ src: string | null | undefined; srcset: string | null | undefined }>,
): MetaImageUrlCandidate | null {
  const allCandidates: MetaImageUrlCandidate[] = [];
  for (const input of inputs) {
    allCandidates.push(...collectImageUrlCandidates(input.src, input.srcset));
  }
  return pickBestMetaImageUrl(allCandidates);
}

export async function collectAssistantImageInputs(
  assistant: Locator,
): Promise<Array<{ src: string | null; srcset: string | null }>> {
  const images = assistant.locator(META_CONFIG.selectors.resultImages);
  const count = await images.count().catch(() => 0);
  const inputs: Array<{ src: string | null; srcset: string | null }> = [];

  for (let index = 0; index < count; index += 1) {
    const img = images.nth(index);
    const src = await img.getAttribute('src').catch(() => null);
    const srcset = await img.getAttribute('srcset').catch(() => null);
    inputs.push({ src, srcset });
  }

  if (inputs.length === 0) {
    const fallbackCount = await assistant.locator('img').count().catch(() => 0);
    for (let index = 0; index < fallbackCount; index += 1) {
      const img = assistant.locator('img').nth(index);
      const src = await img.getAttribute('src').catch(() => null);
      const srcset = await img.getAttribute('srcset').catch(() => null);
      inputs.push({ src, srcset });
    }
  }

  return inputs;
}

export interface ResolveMetaImageSourceUrlOptions {
  pollDelayMs?: number;
  onPoll?: (candidateCount: number, best: MetaImageUrlCandidate | null) => void;
}

/**
 * Poll assistant message images until an HTTP URL appears, or timeout and
 * fall back to the best blob URL if that is all Meta rendered.
 */
export async function resolveMetaImageSourceUrl(
  assistant: Locator,
  timeoutMs: number,
  options?: ResolveMetaImageSourceUrlOptions,
): Promise<ResolvedMetaImageUrl> {
  const deadline = Date.now() + timeoutMs;
  const pollDelayMs = options?.pollDelayMs ?? 400;
  let lastBlob: MetaImageUrlCandidate | null = null;
  let lastCandidateCount = 0;

  while (Date.now() < deadline) {
    const inputs = await collectAssistantImageInputs(assistant);
    const best = pickBestMetaImageUrlFromInputs(inputs);
    lastCandidateCount = inputs.reduce(
      (count, input) => count + collectImageUrlCandidates(input.src, input.srcset).length,
      0,
    );
    options?.onPoll?.(lastCandidateCount, best);

    if (best?.kind === 'http') {
      return { url: best.url, kind: best.kind, candidateCount: lastCandidateCount };
    }

    if (best?.kind === 'blob') {
      lastBlob = best;
    }

    await new Promise(resolve => setTimeout(resolve, pollDelayMs));
  }

  if (lastBlob) {
    return { url: lastBlob.url, kind: lastBlob.kind, candidateCount: lastCandidateCount };
  }

  throw new Error('No downloadable image URL found in assistant message');
}
