import fs from 'node:fs/promises';
import path from 'node:path';
import type { LlmBrowserProvider } from '../../infrastructure/llm-browser/llm-browser.types.js';
import {
  chunkSrtBlocksForMeta,
  parseSrt,
  resolvePreviousContext,
  srtBlocksToIndexedText,
  type SrtBlock,
} from '../../infrastructure/subtitle/srt-utils.js';
import { AppError } from '../../shared/http/errors.js';
import type { ChromeProfile } from '../chrome-profiles/chrome-profiles.types.js';
import { chromeProfilesService } from '../chrome-profiles/chrome-profiles.service.js';
import { llmBrowserService } from '../llm-browser/llm-browser.service.js';
import { executePromptTemplate } from '../prompts/prompts.file-store.js';
import { promptsRepository } from '../prompts/prompts.repository.js';
import { promptsSettingsService } from '../prompts/prompts-settings.service.js';
import type { PromptLanguage } from '../prompts/prompts.types.js';
import { tryParseMetaStep1Response } from './reup-meta-response.js';
import type { MetaStep1ChunkAnalysis, MetaStep1MicroSegment, MetaStep1Output } from './reup-metadata.types.js';

const META_STEP1_KEY = 'step_1';
const BATCH_SIZE = 150;
const MIN_LAST_BATCH = 70;
const MAX_CONCURRENT_PROFILES = 5;
const MAX_BATCH_RETRIES = 3;
const BATCH_DELAY_MS = 2_000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export type MetaStep1Status = 'started' | 'ok' | 'retry' | 'fallback';

export interface MetaStep1Progress {
  batchIndex: number;
  totalBatches: number;
  profileId: string;
  profileName: string;
  attempt: number;
  status: MetaStep1Status;
}

export interface RunMetaStep1Options {
  onProgress?: (progress: MetaStep1Progress) => void;
}

function logBatchValidationFailure(
  batchIndex: number,
  totalBatches: number,
  attempt: number,
  reason: string,
): void {
  console.warn(`[meta-step1] batch ${batchIndex}/${totalBatches} attempt ${attempt}: validation failed (${reason})`);
}

function createFallbackResult(batchBlocks: SrtBlock[], processingChunkId: string): MetaStep1ChunkAnalysis {
  const lineStart = batchBlocks[0].index;
  const lineEnd = batchBlocks[batchBlocks.length - 1].index;

  return {
    processing_chunk_id: processingChunkId,
    line_start: lineStart,
    line_end: lineEnd,
    overall_summary: '',
    micro_segments: [
      {
        segment_id: `${processingChunkId}-fallback`,
        line_start: lineStart,
        line_end: lineEnd,
        summary: batchBlocks.map(block => block.text).join(' ').slice(0, 500),
        key_points: [],
        events: [],
        entities: [],
        narrative_role: 'unknown',
        emotion: [],
        topic: 'unknown',
        confidence: 0,
      },
    ],
    continuity_notes: {
      starts_mid_context: false,
      ends_mid_context: false,
      notes: 'LLM fallback: raw transcript segment preserved',
    },
    quality: {
      ambiguous_points: ['LLM response validation failed'],
      confidence: 0,
    },
  };
}

async function processBatchWithRetry(
  profile: ChromeProfile,
  provider: LlmBrowserProvider,
  promptKey: string,
  language: PromptLanguage,
  allBlocks: SrtBlock[],
  batchBlocks: SrtBlock[],
  batchIndex: number,
  totalBatches: number,
  onProgress?: RunMetaStep1Options['onProgress'],
): Promise<MetaStep1ChunkAnalysis> {
  const processingChunkId = `chunk-${batchIndex}`;
  const indexedText = srtBlocksToIndexedText(batchBlocks);
  const previousContext = resolvePreviousContext(allBlocks, batchBlocks);

  for (let attempt = 1; attempt <= MAX_BATCH_RETRIES; attempt += 1) {
    onProgress?.({
      batchIndex,
      totalBatches,
      profileId: profile.id,
      profileName: profile.name,
      attempt,
      status: attempt === 1 ? 'started' : 'retry',
    });

    try {
      const userPrompt = await executePromptTemplate(language, promptKey, [indexedText, previousContext]);
      const response = await llmBrowserService.chat(profile.id, provider, userPrompt, undefined, {
        submitWith: 'enter',
        pasteStrategy: 'direct',
      });

      const parsed = tryParseMetaStep1Response(response, batchBlocks, processingChunkId);
      if (parsed) {
        onProgress?.({
          batchIndex,
          totalBatches,
          profileId: profile.id,
          profileName: profile.name,
          attempt,
          status: 'ok',
        });
        return parsed;
      }

      logBatchValidationFailure(batchIndex, totalBatches, attempt, 'invalid JSON or schema mismatch');
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      logBatchValidationFailure(batchIndex, totalBatches, attempt, detail);
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

  return createFallbackResult(batchBlocks, processingChunkId);
}

export async function runMetaStep1(
  updatedSrtPath: string,
  language: PromptLanguage,
  options?: RunMetaStep1Options,
): Promise<MetaStep1MicroSegment[]> {
  if (language !== 'ja') {
    throw new AppError('Metadata step 1 is only supported for Japanese', 400, 'UNSUPPORTED_LANGUAGE');
  }

  const prompt = promptsRepository
    .findAll()
    .find(item => item.category === 'meta' && item.language === language && item.key === META_STEP1_KEY);

  if (!prompt) {
    throw new AppError(`Metadata step 1 prompt not found for language "${language}"`, 404, 'PROMPT_NOT_FOUND');
  }

  const promptKey = prompt.key;

  const srtContent = await fs.readFile(updatedSrtPath, 'utf8');
  const blocks = parseSrt(srtContent);
  if (blocks.length === 0) {
    throw new AppError('Updated SRT file is empty or invalid', 400, 'INVALID_SRT');
  }

  const batches = chunkSrtBlocksForMeta(blocks, BATCH_SIZE, MIN_LAST_BATCH);
  const totalBatches = batches.length;
  const provider = promptsSettingsService.get().defaultLlmProvider;
  const workerCount = Math.min(MAX_CONCURRENT_PROFILES, totalBatches);
  const profiles = chromeProfilesService.pickSubProfiles(workerCount);

  console.log(`[meta-step1] Mở ${workerCount} Chrome profile cho ${totalBatches} batch (${profiles.map(p => p.name).join(', ')})...`);

  const results: MetaStep1ChunkAnalysis[] = new Array(totalBatches);
  let nextBatchIndex = 0;

  try {
    async function workerProfile(profile: ChromeProfile): Promise<void> {
      await llmBrowserService.open(profile.id, provider);

      while (true) {
        const batchIndex = nextBatchIndex++;
        if (batchIndex >= totalBatches) break;

        console.log(`[meta-step1] profile ${profile.name} processing batch ${batchIndex + 1}/${totalBatches}`);

        try {
          results[batchIndex] = await processBatchWithRetry(
            profile,
            provider,
            promptKey,
            language,
            blocks,
            batches[batchIndex],
            batchIndex + 1,
            totalBatches,
            options?.onProgress,
          );
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          console.warn(`[meta-step1] batch ${batchIndex + 1}/${totalBatches} lỗi profile ${profile.name}: ${reason}`);
          results[batchIndex] = createFallbackResult(batches[batchIndex], `chunk-${batchIndex + 1}`);
        }

        if (nextBatchIndex < totalBatches) {
          await sleep(BATCH_DELAY_MS);
        }
      }
    }

    await Promise.all(profiles.map(workerProfile));

    const sortedChunkAnalyses = results.filter(Boolean).sort((a, b) => {
      const aStart = Number(a.line_start);
      const bStart = Number(b.line_start);
      if (aStart !== bStart) return aStart - bStart;
      const aEnd = Number(a.line_end);
      const bEnd = Number(b.line_end);
      return aEnd - bEnd;
    });

    const microSegments = sortedChunkAnalyses.flatMap(analysis => analysis.micro_segments);

    const outputDir = path.dirname(updatedSrtPath);
    const videoId = path.basename(outputDir);
    const outputPath = path.join(outputDir, 'meta.step1.json');

    const output: MetaStep1Output = {
      videoId,
      language,
      generatedAt: new Date().toISOString(),
      micro_segments: microSegments,
    };

    await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf8');
    console.log(`[meta-step1] saved: ${outputPath} (${microSegments.length} micro_segments)`);

    return microSegments;
  } finally {
    await chromeProfilesService.closeAllSubProfiles();
  }
}
