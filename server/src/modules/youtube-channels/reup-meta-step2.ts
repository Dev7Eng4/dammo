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
import type { MetaStep1MicroSegment, MetaStep2BatchAnalysis, MetaStep2Output, MetaStep2Section } from './reup-metadata.types.js';

const META_STEP2_KEY = 'step_2';
const BATCH_SIZE = 12;
const MIN_LAST_BATCH = 6;
const MAX_CONCURRENT_PROFILES = 5;
const MAX_BATCH_RETRIES = 3;
const BATCH_DELAY_MS = 2_000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function chunkMicroSegmentsForStep2(
  segments: MetaStep1MicroSegment[],
  size = BATCH_SIZE,
  minLastBatch = MIN_LAST_BATCH,
): MetaStep1MicroSegment[][] {
  if (size <= 0) return [segments];
  const batches: MetaStep1MicroSegment[][] = [];
  for (let i = 0; i < segments.length; i += size) {
    batches.push(segments.slice(i, i + size));
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

function createFallbackResult(batchMicroSegments: MetaStep1MicroSegment[], groupId: string, videoId: string): MetaStep2BatchAnalysis {
  return {
    video_id: videoId,
    group_id: groupId,
    sections: batchMicroSegments.map(segment => ({
      section_id: segment.segment_id,
      title: segment.topic || 'unknown',
      summary: segment.summary,
      source_chunk_ids: [segment.line_start],
      start_line: segment.line_start,
      end_line: segment.line_end,
      narrative_role: segment.narrative_role,
      emotion_arc: segment.emotion.join(', ') || 'unknown',
      main_points: segment.key_points.map(point => point.text),
      merged_entities: segment.entities.map(entity => ({
        name: entity.name,
        type: entity.type,
        confidence: entity.confidence,
      })),
      visual_beats: segment.visual_cues?.map(cue => cue.text) ?? [],
      continuity_notes: 'LLM fallback: micro_segment preserved as section',
      confidence: segment.confidence,
    })),
    quality: {
      merged_redundancies: [],
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
  batchMicroSegments: MetaStep1MicroSegment[],
  batchIndex: number,
  totalBatches: number,
  videoId: string,
  onProgress?: RunMetaStep2Options['onProgress'],
): Promise<MetaStep2BatchAnalysis> {
  const groupId = `group-${batchIndex}`;

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
      const userPrompt = await executePromptTemplate(language, promptKey, [JSON.stringify(batchMicroSegments, null, 2)]);
      const response = await llmBrowserService.chat(profile.id, provider, userPrompt, undefined, {
        submitWith: 'enter',
        pasteStrategy: 'direct',
      });

      const parsed = tryParseMetaStep2Response(response, batchMicroSegments, groupId, videoId);
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

  return createFallbackResult(batchMicroSegments, groupId, videoId);
}

export async function runMetaStep2(
  microSegments: MetaStep1MicroSegment[],
  language: PromptLanguage,
  videoId: string,
  options?: RunMetaStep2Options,
): Promise<MetaStep2Section[]> {
  if (language !== 'ja') {
    throw new AppError('Metadata step 2 is only supported for Japanese', 400, 'UNSUPPORTED_LANGUAGE');
  }

  if (microSegments.length === 0) {
    throw new AppError('No micro_segments provided for metadata step 2', 400, 'INVALID_INPUT');
  }

  const prompt = promptsRepository
    .findAll()
    .find(item => item.category === 'meta' && item.language === language && item.key === META_STEP2_KEY);

  if (!prompt) {
    throw new AppError(`Metadata step 2 prompt not found for language "${language}"`, 404, 'PROMPT_NOT_FOUND');
  }

  const promptKey = prompt.key;
  const batches = chunkMicroSegmentsForStep2(microSegments);
  const totalBatches = batches.length;
  const provider = promptsSettingsService.get().defaultLlmProvider;
  const workerCount = Math.min(MAX_CONCURRENT_PROFILES, totalBatches);
  const profiles = chromeProfilesService.pickSubProfiles(workerCount);

  console.log(`[meta-step2] Mở ${workerCount} Chrome profile cho ${totalBatches} batch (${profiles.map(p => p.name).join(', ')})...`);

  const results: MetaStep2BatchAnalysis[] = new Array(totalBatches);
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
            videoId,
            options?.onProgress,
          );
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          console.warn(`[meta-step2] batch ${batchIndex + 1}/${totalBatches} lỗi profile ${profile.name}: ${reason}`);
          results[batchIndex] = createFallbackResult(batches[batchIndex], `group-${batchIndex + 1}`, videoId);
        }

        if (nextBatchIndex < totalBatches) {
          await sleep(BATCH_DELAY_MS);
        }
      }
    }

    await Promise.all(profiles.map(workerProfile));

    const sections = results
      .filter(Boolean)
      .flatMap(result => result.sections)
      .sort((a, b) => {
        if (a.start_line !== b.start_line) return a.start_line - b.start_line;
        return a.end_line - b.end_line;
      });

    if (options?.outputDir) {
      const outputPath = path.join(options.outputDir, 'meta.step2.json');
      const output: MetaStep2Output = {
        videoId,
        language,
        generatedAt: new Date().toISOString(),
        sections,
      };
      await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf8');
      console.log(`[meta-step2] saved: ${outputPath} (${sections.length} sections)`);
    }

    return sections;
  } finally {
    await chromeProfilesService.closeAllSubProfiles();
  }
}
