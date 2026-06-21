import fs from 'node:fs/promises';
import path from 'node:path';
import type { LlmBrowserResponse, LlmTextProvider } from '../../infrastructure/llm-browser/llm-browser.types.js';
import {
  chunkSrtBlocks,
  parseIndexedTranscriptResponse,
  parseSrt,
  serializeSrt,
  srtBlocksToIndexedText,
  tryApplyIndexedCorrections,
  type SrtBlock,
} from '../../infrastructure/subtitle/srt-utils.js';
import { executePromptTemplate } from '../prompts/prompts.file-store.js';
import { promptsRepository } from '../prompts/prompts.repository.js';
import { promptsSettingsService } from '../prompts/prompts-settings.service.js';
import type { PromptLanguage } from '../prompts/prompts.types.js';
import type { ChromeProfile } from '../chrome-profiles/chrome-profiles.types.js';
import { chromeProfilesService } from '../chrome-profiles/chrome-profiles.service.js';
import { llmBrowserService } from '../llm-browser/llm-browser.service.js';
import { AppError } from '../../shared/http/errors.js';
import type { TranscriptLanguage } from '../../infrastructure/youtube/youtube-transcript-downloader.js';

const BATCH_SIZE = 80;
const MAX_CONCURRENT_PROFILES = 5;
const MAX_BATCH_RETRIES = 3;
const BATCH_DELAY_MS = 2_000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export type TranscriptUpdateStatus = 'started' | 'ok' | 'retry' | 'fallback';

export interface TranscriptUpdateProgress {
  batchIndex: number;
  totalBatches: number;
  profileId: string;
  profileName: string;
  attempt: number;
  status: TranscriptUpdateStatus;
}

export interface UpdateTranscriptOptions {
  onProgress?: (progress: TranscriptUpdateProgress) => void;
}

async function removeIntermediateTranscriptFiles(srtPath: string): Promise<void> {
  const vttPath = srtPath.replace(/\.srt$/i, '.vtt');

  for (const filePath of [srtPath, vttPath]) {
    try {
      await fs.unlink(filePath);
      console.log(`[transcript-update] removed: ${filePath}`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        const detail = err instanceof Error ? err.message : String(err);
        console.warn(`[transcript-update] failed to remove ${filePath}: ${detail}`);
      }
    }
  }
}

function resolveUpdatedSrtPath(srtPath: string, _language: TranscriptLanguage): string {
  return path.join(path.dirname(srtPath), 'transcript.srt');
}

function resolveLlmTranscriptText(response: LlmBrowserResponse): string {
  const fromContent = parseIndexedTranscriptResponse(response.content);
  if (response.codeBlocks.length > 0) {
    const lastCodeBlock = response.codeBlocks[response.codeBlocks.length - 1];
    const fromCode = parseIndexedTranscriptResponse(lastCodeBlock);
    if (fromCode.size > fromContent.size) {
      return lastCodeBlock;
    }
  }
  return response.content;
}

function logBatchValidationFailure(
  batchIndex: number,
  totalBatches: number,
  attempt: number,
  expected: number,
  parsed: number,
  reason: string
): void {
  console.warn(
    `[transcript-batch] batch ${batchIndex}/${totalBatches} attempt ${attempt}: expected ${expected} lines, parsed ${parsed}, apply failed (${reason})`
  );
}

async function processBatchWithRetry(
  profile: ChromeProfile,
  provider: LlmTextProvider,
  promptKey: string,
  language: TranscriptLanguage,
  blocks: SrtBlock[],
  batchIndex: number,
  totalBatches: number,
  onProgress?: UpdateTranscriptOptions['onProgress']
): Promise<SrtBlock[]> {
  const indexedText = srtBlocksToIndexedText(blocks);
  const userPrompt = await executePromptTemplate(language as PromptLanguage, promptKey, [indexedText]);

  for (let attempt = 1; attempt <= MAX_BATCH_RETRIES; attempt += 1) {
    console.log('🚀 ~ processBatchWithRetry ~ attempt:', attempt);
    onProgress?.({
      batchIndex,
      totalBatches,
      profileId: profile.id,
      profileName: profile.name,
      attempt,
      status: attempt === 1 ? 'started' : 'retry',
    });

    try {
      const response = await llmBrowserService.chat(profile.id, provider, userPrompt, undefined, {
        submitWith: 'enter',
        pasteStrategy: 'direct',
      });
      console.log('🚀 ~ processBatchWithRetry ~ response:');

      const rawText = resolveLlmTranscriptText(response);
      const corrections = parseIndexedTranscriptResponse(rawText);
      const updated = tryApplyIndexedCorrections(blocks, corrections);
      if (updated) {
        onProgress?.({
          batchIndex,
          totalBatches,
          profileId: profile.id,
          profileName: profile.name,
          attempt,
          status: 'ok',
        });
        return updated;
      }

      const reason =
        corrections.size === 0
          ? 'empty response'
          : corrections.size !== blocks.length
          ? 'line count mismatch'
          : 'duplicate or invalid indices';
      logBatchValidationFailure(batchIndex, totalBatches, attempt, blocks.length, corrections.size, reason);
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      logBatchValidationFailure(batchIndex, totalBatches, attempt, blocks.length, 0, detail);
    }
  }

  onProgress?.({
    batchIndex,
    totalBatches,
    profileId: profile.id,
    profileName: profile.name,
    attempt: MAX_BATCH_RETRIES,
    status: 'fallback',
  });

  return blocks;
}

export async function updateTranscriptWithLlm(
  srtPath: string,
  language: TranscriptLanguage,
  options?: UpdateTranscriptOptions
): Promise<string> {
  if (language !== 'ja') {
    throw new AppError('LLM transcript update is only supported for Japanese', 400, 'UNSUPPORTED_LANGUAGE');
  }

  const prompt = promptsRepository
    .findAll()
    .find(item => item.category === 'transcript' && item.language === language);

  if (!prompt) {
    throw new AppError(`Transcript update prompt not found for language "${language}"`, 404, 'PROMPT_NOT_FOUND');
  }

  const promptKey = prompt.key;

  const srtContent = await fs.readFile(srtPath, 'utf8');
  const blocks = parseSrt(srtContent);
  if (blocks.length === 0) {
    throw new AppError('SRT file is empty or invalid', 400, 'INVALID_SRT');
  }

  const batches = chunkSrtBlocks(blocks, BATCH_SIZE);
  const totalBatches = batches.length;
  const provider = promptsSettingsService.get().defaultLlmProvider;
  const workerCount = Math.min(MAX_CONCURRENT_PROFILES, totalBatches);
  const profiles = chromeProfilesService.pickSubProfiles(workerCount);

  console.log(`[transcript-batch] Mở ${workerCount} Chrome profile cho ${totalBatches} batch (${profiles.map(p => p.name).join(', ')})...`);

  const results: SrtBlock[][] = new Array(totalBatches);
  let nextBatchIndex = 0;

  try {
    async function workerProfile(profile: ChromeProfile): Promise<void> {
      await llmBrowserService.open(profile.id, provider);

      while (true) {
        const batchIndex = nextBatchIndex++;
        if (batchIndex >= totalBatches) break;

        console.log(`[transcript-batch] profile ${profile.name} processing batch ${batchIndex + 1}/${totalBatches}`);

        try {
          results[batchIndex] = await processBatchWithRetry(
            profile,
            provider,
            promptKey,
            language,
            batches[batchIndex],
            batchIndex + 1,
            totalBatches,
            options?.onProgress
          );
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          console.warn(`[transcript-batch] batch ${batchIndex + 1}/${totalBatches} lỗi profile ${profile.name}: ${reason}`);
          results[batchIndex] = batches[batchIndex];
        }

        if (nextBatchIndex < totalBatches) {
          await sleep(BATCH_DELAY_MS);
        }
      }
    }

    await Promise.all(profiles.map(workerProfile));

    const mergedBlocks = results.flat();
    const updatedContent = serializeSrt(mergedBlocks);

    const updatedPath = resolveUpdatedSrtPath(srtPath, language);
    await fs.writeFile(updatedPath, updatedContent, 'utf8');
    await removeIntermediateTranscriptFiles(srtPath);

    return updatedPath;
  } finally {
    await chromeProfilesService.closeSubProfiles(profiles.map(profile => profile.id));
  }
}
