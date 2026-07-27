import { AppError } from '../../../../shared/http/errors.js';
import { chromeProfilesService } from '../../../chrome-profiles/chrome-profiles.service.js';
import { llmBrowserService } from '../../../llm-browser/llm-browser.service.js';
import { executePromptTemplate } from '../../../prompts/prompts.file-store.js';
import { promptsSettingsService } from '../../../prompts/prompts-settings.service.js';
import { generateCharacterReferences } from './ai-video-character-references.js';
import { tryParseAiVideoSceneResponse } from './ai-video-scene-response.js';
import { prepareTranscriptDensityChunks } from './ai-video-transcript.js';
import {
  AI_VIDEO_DENSITY_MAX_SCENE_SEC,
  VIDEO_IMAGE_PROMPT_KEY,
  VIDEO_IMAGE_WITH_REFERENCE_PROMPT_KEY,
  type AiVideoDensityLevel,
} from './ai-video.constants.js';
import { persistAiScenePromptsFile } from './ai-video-scene-prompts-store.js';
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

function buildDensityChunkJobs(chunks: {
  high: TranscriptCue[][];
  medium: TranscriptCue[][];
  low: TranscriptCue[][];
}): DensityChunkJob[] {
  const jobs: DensityChunkJob[] = [];
  const densities: AiVideoDensityLevel[] = ['high', 'medium', 'low'];

  for (const density of densities) {
    const densityChunks = chunks[density];
    densityChunks.forEach((transcriptChunk, chunkIndex) => {
      jobs.push({
        density,
        chunkIndex,
        totalChunks: densityChunks.length,
        maxDurationSec: AI_VIDEO_DENSITY_MAX_SCENE_SEC[density],
        transcriptChunk,
      });
    });
  }

  return jobs;
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
  const args: unknown[] =
    promptKey === VIDEO_IMAGE_WITH_REFERENCE_PROMPT_KEY
      ? [
          JSON.stringify(job.transcriptChunk),
          input.visualStyle.rule,
          job.maxDurationSec,
          options?.charactersJson ?? '[]',
        ]
      : [JSON.stringify(job.transcriptChunk), input.visualStyle.rule, job.maxDurationSec];

  const userPrompt = await executePromptTemplate(input.language, promptKey, args);

  let lastReason = 'unknown error';

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
          pasteStrategy: 'direct',
        },
      );

      const parsed = tryParseAiVideoSceneResponse(response, {
        requireReferences: options?.requireReferences === true,
      });
      if (parsed) {
        return parsed;
      }

      lastReason = 'invalid JSON or schema mismatch';
    } catch (err) {
      lastReason = err instanceof Error ? err.message : 'unknown error';
    }
  }

  throw new AppError(
    `AI scene prompt generation failed for ${job.density} chunk ${job.chunkIndex + 1}/${job.totalChunks} after ${MAX_RETRIES} attempts: ${lastReason}`,
    502,
    'AI_SCENE_PROMPT_FAILED',
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
  const profile = chromeProfilesService.pickSubProfile();
  const allScenes: AiVideoScenePrompt[] = [];

  log(`[ai-video] Mở Chrome profile ${profile.name} cho scene prompts...`);

  try {
    await llmBrowserService.open(profile.id, promptsSettingsService.get().defaultLlmProvider);

    for (const job of jobs) {
      log(
        `[ai-video] LLM ${job.density} chunk ${job.chunkIndex + 1}/${job.totalChunks} (${job.transcriptChunk.length} cue(s), maxDuration=${job.maxDurationSec}s)...`,
      );

      const scenes = await executeScenePromptChunk(profile.id, input, job, options);
      allScenes.push(...scenes);
      log(`[ai-video] ${job.density} chunk ${job.chunkIndex + 1}/${job.totalChunks} → ${scenes.length} scene(s)`);

      const savedPath = await persistAiScenePromptsFile(input.workDir, input.youtubeVideoId, allScenes);
      log(`[ai-video] Scene prompts checkpoint → ${savedPath} (${allScenes.length} scene(s))`);
    }
  } finally {
    await chromeProfilesService.closeSubProfiles([profile.id]);
  }

  const filePath = await persistAiScenePromptsFile(input.workDir, input.youtubeVideoId, allScenes);
  log(`[ai-video] Scene prompts saved → ${filePath} (${allScenes.length} scene(s))`);

  return { scenes: allScenes, filePath };
}

export async function generateAiVideoImages(input: GenerateAiVideoImagesInput): Promise<GenerateAiVideoImagesResult> {
  const log = (msg: string) => {
    console.log(msg);
    input.onLog?.(msg);
  };

  const prepared = await prepareTranscriptDensityChunks(input.subtitlePath, input.audioPath, {
    maxTranscriptSec: input.maxTranscriptSec,
  });
  const jobs = buildDensityChunkJobs(prepared.chunks);

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
  const log = (msg: string) => {
    console.log(msg);
    input.onLog?.(msg);
  };

  log('[ai-video] useReferenceImage=true → character design + video_image_with_reference');

  const characterResult = await generateCharacterReferences({
    workDir: input.workDir,
    youtubeVideoId: input.youtubeVideoId,
    visualStyle: input.visualStyle,
    subtitlePath: input.subtitlePath,
    language: input.language,
    onLog: input.onLog,
  });

  const prepared = await prepareTranscriptDensityChunks(input.subtitlePath, input.audioPath, {
    maxTranscriptSec: input.maxTranscriptSec,
  });
  const jobs = buildDensityChunkJobs(prepared.chunks);

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
