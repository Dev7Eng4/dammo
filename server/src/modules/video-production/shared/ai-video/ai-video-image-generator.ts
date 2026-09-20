import { srtTimestampToMs } from '../../../../infrastructure/subtitle/srt-utils.js';
import { mapPool } from '../../../../shared/async/map-pool.js';
import { AppError } from '../../../../shared/http/errors.js';
import { appSettingsService } from '../../../app-settings/app-settings.service.js';
import { chromeProfilesService } from '../../../chrome-profiles/chrome-profiles.service.js';
import { llmBrowserService } from '../../../llm-browser/llm-browser.service.js';
import { executePromptTemplate } from '../../../prompts/prompts.file-store.js';
import { promptsSettingsService } from '../../../prompts/prompts-settings.service.js';
import { persistLlmParseFailure } from '../meta/persist-llm-failure.js';
import { generateCharacterReferences } from './ai-video-character-references.js';
import { tryParseAiVideoSceneResponse } from './ai-video-scene-response.js';
import { prepareTranscriptDensityChunks } from './ai-video-transcript.js';
import {
  AI_VIDEO_SCENE_PROMPT_TIMEOUT_MS,
  resolveAiSceneDensityMaxSec,
  VIDEO_IMAGE_PROMPT_KEY,
  VIDEO_IMAGE_WITH_REFERENCE_PROMPT_KEY,
  type AiSceneDensityMaxSec,
  type AiVideoDensityLevel,
} from './ai-video.constants.js';
import { findOverlappingScenes, persistAiScenePromptsFile } from './ai-video-scene-prompts-store.js';
import {
  clampAiScenePromptConcurrency,
  resolveAiScenePromptProfiles,
} from './ai-video-chrome-profile.js';
import { emitDetailLog } from '../video-log.js';
import type {
  AiVideoCharacterReference,
  AiVideoScenePrompt,
  GenerateAiVideoImagesInput,
  GenerateAiVideoImagesResult,
  GenerateAiVideoImagesWithCharactersResult,
  TranscriptCue,
} from './ai-video.types.js';

const MAX_RETRIES = 3;

interface DensityChunkJob {
  density: AiVideoDensityLevel;
  chunkIndex: number;
  totalChunks: number;
  maxDurationSec: number;
  transcriptChunk: TranscriptCue[];
}

function createProfileBorrowPool(profileIds: string[]) {
  const free = [...profileIds];
  const waiters: Array<(id: string) => void> = [];

  async function acquire(): Promise<string> {
    const id = free.pop();
    if (id) return id;
    return new Promise(resolve => {
      waiters.push(resolve);
    });
  }

  function release(id: string): void {
    const next = waiters.shift();
    if (next) {
      next(id);
      return;
    }
    free.push(id);
  }

  return { acquire, release };
}

function buildDensityChunkJobs(
  chunks: {
    high: TranscriptCue[][];
    medium: TranscriptCue[][];
    low: TranscriptCue[][];
  },
  densityMaxSceneSec?: AiSceneDensityMaxSec,
): DensityChunkJob[] {
  const maxByDensity = resolveAiSceneDensityMaxSec(densityMaxSceneSec);
  const jobs: DensityChunkJob[] = [];
  const densities: AiVideoDensityLevel[] = ['high', 'medium', 'low'];

  for (const density of densities) {
    const densityChunks = chunks[density];
    densityChunks.forEach((transcriptChunk, chunkIndex) => {
      jobs.push({
        density,
        chunkIndex,
        totalChunks: densityChunks.length,
        maxDurationSec: maxByDensity[density],
        transcriptChunk,
      });
    });
  }

  return jobs;
}

/** Tolerance for LLM rounding scene boundaries slightly past the chunk edges. */
const SCENE_RANGE_TOLERANCE_MS = 2_000;

/**
 * Detect a response that belongs to a different chunk — the signature of the browser
 * layer handing back a previous turn's answer, which parses as valid but duplicates scenes.
 */
function scenesOutsideChunkRange(
  scenes: AiVideoScenePrompt[],
  chunkStartMs: number,
  chunkEndMs: number,
): boolean {
  return scenes.some(scene => {
    const startMs = srtTimestampToMs(scene.startTime);
    return (
      startMs < chunkStartMs - SCENE_RANGE_TOLERANCE_MS ||
      startMs > chunkEndMs + SCENE_RANGE_TOLERANCE_MS
    );
  });
}

async function executeScenePromptChunk(
  profileId: string,
  input: GenerateAiVideoImagesInput,
  job: DensityChunkJob,
  options?: {
    promptKey?: string;
    charactersJson?: string;
    requireReferences?: boolean;
  },
): Promise<AiVideoScenePrompt[]> {
  const promptKey = options?.promptKey ?? VIDEO_IMAGE_PROMPT_KEY;
  const niche = input.detectedNiche ?? '';
  const args: unknown[] =
    promptKey === VIDEO_IMAGE_WITH_REFERENCE_PROMPT_KEY
      ? [
          JSON.stringify(job.transcriptChunk),
          input.visualStyle.rule,
          niche,
          job.maxDurationSec,
          options?.charactersJson ?? '[]',
        ]
      : [JSON.stringify(job.transcriptChunk), input.visualStyle.rule, niche, job.maxDurationSec];

  const userPrompt = await executePromptTemplate(input.language, promptKey, args);

  const chunkStartMs = srtTimestampToMs(job.transcriptChunk[0].startTime);
  const chunkEndMs = srtTimestampToMs(job.transcriptChunk[job.transcriptChunk.length - 1].endTime);

  let lastReason = 'unknown error';
  let lastResponsePath: string | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    input.onProgress?.({
      density: job.density,
      chunkIndex: job.chunkIndex,
      totalChunks: job.totalChunks,
      attempt,
    });

    try {
      const response = await llmBrowserService.chat(
        profileId,
        promptsSettingsService.get().defaultLlmProvider,
        userPrompt,
        undefined,
        {
          submitWith: 'enter',
          pasteStrategy: 'human',
          timeoutMs: AI_VIDEO_SCENE_PROMPT_TIMEOUT_MS,
        },
      );

      const parsed = tryParseAiVideoSceneResponse(response, {
        requireReferences: options?.requireReferences === true,
      });

      if (parsed && !scenesOutsideChunkRange(parsed, chunkStartMs, chunkEndMs)) {
        return parsed;
      }

      lastReason = parsed
        ? 'scene timestamps outside chunk range (stale LLM response?)'
        : 'invalid JSON or schema mismatch';
      lastResponsePath = await persistLlmParseFailure({
        outputDir: input.workDir,
        label: `ai-scene-${job.density}-${job.chunkIndex}`,
        attempt,
        reason: lastReason,
        response,
      });
    } catch (err) {
      lastReason = err instanceof Error ? err.message : 'unknown error';
    }
  }

  throw new AppError(
    `AI scene prompt generation failed for ${job.density} chunk ${job.chunkIndex + 1}/${job.totalChunks} after ${MAX_RETRIES} attempts: ${lastReason}`,
    502,
    'AI_SCENE_PROMPT_FAILED',
    {
      reason: lastReason,
      ...(lastResponsePath ? { responsePath: lastResponsePath } : {}),
    },
  );
}

async function generateScenePromptsFromJobs(
  input: GenerateAiVideoImagesInput,
  jobs: DensityChunkJob[],
  log: (msg: string) => void,
  options?: {
    promptKey?: string;
    charactersJson?: string;
    requireReferences?: boolean;
  },
): Promise<GenerateAiVideoImagesResult> {
  const requestedConcurrency = clampAiScenePromptConcurrency(
    appSettingsService.get().aiScenePromptConcurrency,
    1,
  );
  const profiles = resolveAiScenePromptProfiles(requestedConcurrency);
  const profileIds = profiles.map(profile => profile.id);
  const provider = promptsSettingsService.get().defaultLlmProvider;

  if (profiles.length < requestedConcurrency) {
    log(
      `[ai-video] Scene prompt concurrency clamped ${requestedConcurrency} → ${profiles.length} (available sub profiles)`,
    );
  }

  log(
    `[ai-video] Mở ${profiles.length} Chrome profile(s) cho scene prompts: ${profiles.map(p => p.name).join(', ')}...`,
  );

  const completedSlots: Array<AiVideoScenePrompt[] | undefined> = new Array(jobs.length);
  let checkpointChain: Promise<void> = Promise.resolve();

  const scheduleCheckpoint = (jobIndex: number, scenes: AiVideoScenePrompt[], job: DensityChunkJob) => {
    completedSlots[jobIndex] = scenes;
    checkpointChain = checkpointChain.then(async () => {
      const merged: AiVideoScenePrompt[] = [];
      for (const slot of completedSlots) {
        if (slot) merged.push(...slot);
      }

      const overlaps = findOverlappingScenes(merged);
      if (overlaps.length > 0) {
        const first = overlaps[0];
        log(
          `[ai-video] WARNING: ${overlaps.length} scene overlap sau ${job.density} chunk ${job.chunkIndex + 1}/${job.totalChunks} — scene #${first.index + 1} bắt đầu ${first.startTime} < ${first.previousEndTime} (nghi duplicate prompt)`,
        );
      }

      const savedPath = await persistAiScenePromptsFile(input.workDir, input.youtubeVideoId, merged);
      log(`[ai-video] Scene prompts checkpoint → ${savedPath} (${merged.length} scene(s))`);
    });
    return checkpointChain;
  };

  const { acquire, release } = createProfileBorrowPool(profileIds);

  try {
    await Promise.all(profileIds.map(id => llmBrowserService.open(id, provider)));

    const chunkResults = await mapPool(jobs, profiles.length, async (job, jobIndex) => {
      log(
        `[ai-video] LLM ${job.density} chunk ${job.chunkIndex + 1}/${job.totalChunks} (${job.transcriptChunk.length} cue(s), maxDuration=${job.maxDurationSec}s)...`,
      );

      const profileId = await acquire();
      try {
        const scenes = await executeScenePromptChunk(profileId, input, job, options);
        log(
          `[ai-video] ${job.density} chunk ${job.chunkIndex + 1}/${job.totalChunks} → ${scenes.length} scene(s)`,
        );
        await scheduleCheckpoint(jobIndex, scenes, job);
        return scenes;
      } finally {
        release(profileId);
      }
    });

    await checkpointChain;

    const allScenes = chunkResults.flat();
    const filePath = await persistAiScenePromptsFile(input.workDir, input.youtubeVideoId, allScenes);
    log(`[ai-video] Scene prompts saved → ${filePath} (${allScenes.length} scene(s))`);

    return { scenes: allScenes, filePath };
  } finally {
    await chromeProfilesService.closeSubProfiles(profileIds);
  }
}

export async function generateAiVideoImages(input: GenerateAiVideoImagesInput): Promise<GenerateAiVideoImagesResult> {
  const log = (msg: string) => emitDetailLog(msg, input.onLog);

  const prepared = await prepareTranscriptDensityChunks(input.subtitlePath, input.audioPath, {
    maxTranscriptSec: input.maxTranscriptSec,
  });
  const jobs = buildDensityChunkJobs(prepared.chunks, input.densityMaxSceneSec);

  if (jobs.length === 0) {
    throw new AppError('No transcript chunks available for AI scene prompt generation', 400, 'INVALID_INPUT');
  }

  if (input.maxTranscriptSec != null && input.maxTranscriptSec > 0) {
    log(`[ai-video] Limiting scene prompts to first ${input.maxTranscriptSec}s of transcript`);
  }

  log(
    `[ai-video] Duration ${prepared.totalDurationSec.toFixed(1)}s → tier high=${prepared.tier.highDensity}% medium=${prepared.tier.mediumDensity}% low=${prepared.tier.lowDensity}%`,
  );
  log(
    `[ai-video] Transcript segments: high=${prepared.segments.high.length}, medium=${prepared.segments.medium.length}, low=${prepared.segments.low.length} cue(s)`,
  );
  log(
    `[ai-video] LLM chunks: high=${prepared.chunks.high.length}, medium=${prepared.chunks.medium.length}, low=${prepared.chunks.low.length}`,
  );

  return generateScenePromptsFromJobs(input, jobs, log);
}

export async function generateAiVideoImagesWithReference(
  input: GenerateAiVideoImagesInput,
): Promise<GenerateAiVideoImagesWithCharactersResult> {
  const log = (msg: string) => emitDetailLog(msg, input.onLog);

  log('[ai-video] useReferenceImage=true → image_scenes_with_references_step_1 + step_2');

  const characterResult = await generateCharacterReferences({
    workDir: input.workDir,
    youtubeVideoId: input.youtubeVideoId,
    visualStyle: input.visualStyle,
    subtitlePath: input.subtitlePath,
    language: input.language,
    detectedNiche: input.detectedNiche,
    onLog: input.onLog,
  });

  const prepared = await prepareTranscriptDensityChunks(input.subtitlePath, input.audioPath, {
    maxTranscriptSec: input.maxTranscriptSec,
  });
  const jobs = buildDensityChunkJobs(prepared.chunks, input.densityMaxSceneSec);

  if (jobs.length === 0) {
    throw new AppError('No transcript chunks available for AI scene prompt generation', 400, 'INVALID_INPUT');
  }

  if (input.maxTranscriptSec != null && input.maxTranscriptSec > 0) {
    log(`[ai-video] Limiting scene prompts to first ${input.maxTranscriptSec}s of transcript`);
  }

  log(
    `[ai-video] Duration ${prepared.totalDurationSec.toFixed(1)}s → tier high=${prepared.tier.highDensity}% medium=${prepared.tier.mediumDensity}% low=${prepared.tier.lowDensity}%`,
  );
  log(
    `[ai-video] LLM chunks (with reference): high=${prepared.chunks.high.length}, medium=${prepared.chunks.medium.length}, low=${prepared.chunks.low.length}`,
  );

  const charactersJson = JSON.stringify(
    characterResult.characters.map((character: AiVideoCharacterReference) => ({
      id: character.id,
      name: character.name,
      description: character.description,
      prompt: character.prompt,
    })),
  );

  const sceneResult = await generateScenePromptsFromJobs(input, jobs, log, {
    promptKey: VIDEO_IMAGE_WITH_REFERENCE_PROMPT_KEY,
    charactersJson,
    requireReferences: true,
  });

  log(
    '[ai-video] Character design + scene prompts ready (useReferenceImage=true). Continuing to scene image generation.',
  );

  return {
    ...sceneResult,
    characters: characterResult.characters,
    characterFilePath: characterResult.filePath,
    imageReferencesDir: characterResult.imageReferencesDir,
    pauseBeforeSceneImages: false,
  };
}

/** Shared entry for AI / SI multi_image scene prompt generation. */
export async function generateAiScenePromptsForPipeline(
  input: GenerateAiVideoImagesInput,
): Promise<GenerateAiVideoImagesResult & { pauseBeforeSceneImages: boolean; characters?: AiVideoCharacterReference[] }> {
  if (input.useReferenceImage) {
    const result = await generateAiVideoImagesWithReference(input);
    return {
      scenes: result.scenes,
      filePath: result.filePath,
      pauseBeforeSceneImages: false,
      characters: result.characters,
    };
  }

  const result = await generateAiVideoImages(input);
  return {
    ...result,
    pauseBeforeSceneImages: false,
  };
}
