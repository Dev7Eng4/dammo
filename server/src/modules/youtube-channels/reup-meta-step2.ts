import fs from 'node:fs/promises';
import path from 'node:path';
import type { LlmBrowserProvider } from '../../infrastructure/llm-browser/llm-browser.types.js';
import { AppError } from '../../shared/http/errors.js';
import type { ChromeProfile } from '../chrome-profiles/chrome-profiles.types.js';
import { chromeProfilesService } from '../chrome-profiles/chrome-profiles.service.js';
import { llmBrowserService } from '../llm-browser/llm-browser.service.js';
import { executePromptTemplate } from '../prompts/prompts.file-store.js';
import { promptsRepository } from '../prompts/prompts.repository.js';
import { promptsSettingsService } from '../prompts/prompts-settings.service.js';
import type { PromptLanguage } from '../prompts/prompts.types.js';
import { tryParseMetaStep2Response } from './reup-meta-response.js';
import type { MetaStep1Beat, MetaStep1CarryForward, MetaStep1Character, MetaStep1ChunkDigest, MetaStep2Output, MetaStep2StoryBlock } from './reup-metadata.types.js';

const META_STEP2_KEY = 'step_2';
const BATCH_SIZE = 6;
const MIN_LAST_BATCH = 3;
const MAX_CONCURRENT_PROFILES = 5;
const MAX_BATCH_RETRIES = 3;
const BATCH_DELAY_MS = 2_000;
const FALLBACK_SUMMARY_MAX_CHARS = 900;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function chunkDigestsForStep2(
  digests: MetaStep1ChunkDigest[],
  size = BATCH_SIZE,
  minLastBatch = MIN_LAST_BATCH,
): MetaStep1ChunkDigest[][] {
  if (size <= 0) return [digests];
  const batches: MetaStep1ChunkDigest[][] = [];
  for (let i = 0; i < digests.length; i += size) {
    batches.push(digests.slice(i, i + size));
  }
  if (batches.length > 1 && batches[batches.length - 1].length <= minLastBatch) {
    const last = batches.pop()!;
    batches[batches.length - 1] = [...batches[batches.length - 1], ...last];
  }
  return batches;
}

export type MetaStep2Status = 'started' | 'ok' | 'retry' | 'fallback';

export interface MetaStep2Progress {
  batchIndex: number;
  totalBatches: number;
  profileId: string;
  profileName: string;
  attempt: number;
  status: MetaStep2Status;
}

export interface RunMetaStep2Options {
  outputDir?: string;
  onProgress?: (progress: MetaStep2Progress) => void;
}

function logBatchValidationFailure(batchIndex: number, totalBatches: number, attempt: number, reason: string): void {
  console.warn(`[meta-step2] batch ${batchIndex}/${totalBatches} attempt ${attempt}: validation failed (${reason})`);
}

function dedupeCharacters(characters: MetaStep1Character[], max: number): MetaStep1Character[] {
  const seen = new Set<string>();
  const result: MetaStep1Character[] = [];
  for (const character of characters) {
    const key = character.name.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(character);
    if (result.length >= max) break;
  }
  return result;
}

function createFallbackResult(batchChunkDigests: MetaStep1ChunkDigest[]): MetaStep2StoryBlock {
  const first = batchChunkDigests[0];
  const last = batchChunkDigests[batchChunkDigests.length - 1];
  const firstRange = first.range as [number, number];
  const lastRange = last.range as [number, number];
  const range: [number, number] = [firstRange[0], lastRange[1]];

  return {
    source_chunk_ids: batchChunkDigests.map(digest => {
      const digestRange = digest.range as [number, number];
      return `${digestRange[0]}-${digestRange[1]}`;
    }),
    range,
    story_block_summary: batchChunkDigests
      .map(digest => digest.digest)
      .join(' ')
      .slice(0, FALLBACK_SUMMARY_MAX_CHARS),
    major_beats: batchChunkDigests.flatMap(digest => digest.beats as MetaStep1Beat[]).slice(0, 8),
    main_characters: dedupeCharacters(
      batchChunkDigests.flatMap(digest => digest.characters as MetaStep1Character[]),
      10,
    ),
    core_conflicts: batchChunkDigests.flatMap(digest => digest.conflicts_and_reveals as string[]).slice(0, 6),
    important_reveals: batchChunkDigests.flatMap(digest => digest.key_facts as string[]).slice(0, 6),
    emotional_arc: batchChunkDigests.map(digest => digest.emotion_arc).filter(Boolean).join(' ') || '',
    visual_candidates: batchChunkDigests.flatMap(digest => digest.visual_anchors as string[]).slice(0, 8),
    open_threads: batchChunkDigests
      .flatMap(digest => (digest.carry_forward as MetaStep1CarryForward).open_threads)
      .slice(0, 5),
  };
}

async function processBatchWithRetry(
  profile: ChromeProfile,
  provider: LlmBrowserProvider,
  promptKey: string,
  language: PromptLanguage,
  batchChunkDigests: MetaStep1ChunkDigest[],
  batchIndex: number,
  totalBatches: number,
  onProgress?: RunMetaStep2Options['onProgress'],
): Promise<MetaStep2StoryBlock> {
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
      const userPrompt = await executePromptTemplate(language, promptKey, [
        { chunkDigests: JSON.stringify(batchChunkDigests, null, 2) },
      ]);
      const response = await llmBrowserService.chat(profile.id, provider, userPrompt, undefined, {
        submitWith: 'enter',
        pasteStrategy: 'direct',
      });

      const parsed = tryParseMetaStep2Response(response, batchChunkDigests);
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

  return createFallbackResult(batchChunkDigests);
}

export async function runMetaStep2(
  chunkDigests: MetaStep1ChunkDigest[],
  language: PromptLanguage,
  videoId: string,
  options?: RunMetaStep2Options,
): Promise<MetaStep2StoryBlock[]> {
  if (language !== 'ja') {
    throw new AppError('Metadata step 2 is only supported for Japanese', 400, 'UNSUPPORTED_LANGUAGE');
  }

  if (chunkDigests.length < 2) {
    throw new AppError('At least 2 chunk_digests required for metadata step 2', 400, 'INVALID_INPUT');
  }

  const prompt = promptsRepository
    .findAll()
    .find(item => item.category === 'meta' && item.language === language && item.key === META_STEP2_KEY);

  if (!prompt) {
    throw new AppError(`Metadata step 2 prompt not found for language "${language}"`, 404, 'PROMPT_NOT_FOUND');
  }

  const promptKey = prompt.key;
  const batches = chunkDigestsForStep2(chunkDigests);
  const totalBatches = batches.length;
  const provider = promptsSettingsService.get().defaultLlmProvider;
  const workerCount = Math.min(MAX_CONCURRENT_PROFILES, totalBatches);
  const profiles = chromeProfilesService.pickSubProfiles(workerCount);

  console.log(`[meta-step2] Mở ${workerCount} Chrome profile cho ${totalBatches} batch (${profiles.map(p => p.name).join(', ')})...`);

  const results: MetaStep2StoryBlock[] = new Array(totalBatches);
  let nextBatchIndex = 0;

  try {
    async function workerProfile(profile: ChromeProfile): Promise<void> {
      await llmBrowserService.open(profile.id, provider);

      while (true) {
        const batchIndex = nextBatchIndex++;
        if (batchIndex >= totalBatches) break;

        console.log(`[meta-step2] profile ${profile.name} processing batch ${batchIndex + 1}/${totalBatches}`);

        try {
          results[batchIndex] = await processBatchWithRetry(
            profile,
            provider,
            promptKey,
            language,
            batches[batchIndex],
            batchIndex + 1,
            totalBatches,
            options?.onProgress,
          );
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          console.warn(`[meta-step2] batch ${batchIndex + 1}/${totalBatches} lỗi profile ${profile.name}: ${reason}`);
          results[batchIndex] = createFallbackResult(batches[batchIndex]);
        }

        if (nextBatchIndex < totalBatches) {
          await sleep(BATCH_DELAY_MS);
        }
      }
    }

    await Promise.all(profiles.map(workerProfile));

    const storyBlocks = results
      .filter(Boolean)
      .sort((a, b) => (a.range as [number, number])[0] - (b.range as [number, number])[0]);

    if (options?.outputDir) {
      const outputPath = path.join(options.outputDir, 'meta.step2.json');
      const output: MetaStep2Output = {
        videoId,
        language,
        generatedAt: new Date().toISOString(),
        story_blocks: storyBlocks,
      };
      await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf8');
      console.log(`[meta-step2] saved: ${outputPath} (${storyBlocks.length} story_blocks)`);
    }

    return storyBlocks;
  } finally {
    await chromeProfilesService.closeAllSubProfiles();
  }
}
