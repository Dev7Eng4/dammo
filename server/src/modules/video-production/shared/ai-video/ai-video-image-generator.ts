import { AppError } from '../../../../shared/http/errors.js';
import { countEvent, timedPhase } from '../../../../shared/timing/run-timeline.js';
import { chromeProfilesService } from '../../../chrome-profiles/chrome-profiles.service.js';
import { llmBrowserService } from '../../../llm-browser/llm-browser.service.js';
import { executePromptTemplate } from '../../../prompts/prompts.file-store.js';
import { promptsSettingsService } from '../../../prompts/prompts-settings.service.js';
import { persistLlmParseFailure } from '../meta/persist-llm-failure.js';
import { generateCharacterReferences } from './ai-video-character-references.js';
import { tryParseAiVideoSceneResponse } from './ai-video-scene-response.js';
import { prepareTranscriptDensityChunks } from './ai-video-transcript.js';
import {
  AI_SCENE_PROMPT_MAX_PROFILES,
  resolveAiSceneDensityMaxSec,
  VIDEO_IMAGE_PROMPT_KEY,
  VIDEO_IMAGE_WITH_REFERENCE_PROMPT_KEY,
  type AiSceneDensityMaxSec,
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
      const response = await timedPhase('scene prompts', `LLM ${job.density}`, () =>
        llmBrowserService.chat(
          profileId,
          promptsSettingsService.get().defaultLlmProvider,
          userPrompt,
          undefined,
          {
            submitWith: 'enter',
            pasteStrategy: 'human',
          },
        ),
      );

      const parsed = tryParseAiVideoSceneResponse(response, {
        requireReferences: options?.requireReferences === true,
      });
      if (parsed) {
        return parsed;
      }

      countEvent('scene prompt parse retry');
      lastReason = 'invalid JSON or schema mismatch';
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

/** How many sub profiles to actually open, given the pool and the work available. */
function resolveScenePromptProfileCount(jobCount: number): number {
  const available = chromeProfilesService.listSubProfiles().length;
  return Math.max(1, Math.min(AI_SCENE_PROMPT_MAX_PROFILES, available, jobCount));
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
  const profiles = chromeProfilesService.pickSubProfiles(resolveScenePromptProfileCount(jobs.length));
  const provider = promptsSettingsService.get().defaultLlmProvider;

  /* Results are collected per chunk index so the transcript order survives
     whatever order the profiles happen to finish in. */
  const results = new Array<AiVideoScenePrompt[] | undefined>(jobs.length);
  const orderedScenes = (): AiVideoScenePrompt[] => results.flatMap(chunk => chunk ?? []);

  log(
    `[ai-video] Mở ${profiles.length} Chrome profile cho scene prompts ` +
      `(${profiles.map(profile => profile.name).join(', ')}) — ${jobs.length} chunk`,
  );

  let nextJob = 0;
  /*
   * Workers swallow their own failure and stop taking work instead of throwing.
   * A rejecting `Promise.all` would let the remaining profiles keep driving
   * Chrome while the `finally` below closes the very windows they are using.
   */
  let failure: unknown;

  const runProfile = async (profileId: string, profileName: string): Promise<void> => {
    try {
      await timedPhase('scene prompts', 'mở profile', () => llmBrowserService.open(profileId, provider));

      while (failure === undefined) {
        const index = nextJob;
        nextJob += 1;
        if (index >= jobs.length) return;

        const job = jobs[index];
        log(
          `[ai-video] [${profileName}] LLM ${job.density} chunk ${job.chunkIndex + 1}/${job.totalChunks} ` +
            `(${job.transcriptChunk.length} cue(s), maxDuration=${job.maxDurationSec}s)...`,
        );

        const scenes = await executeScenePromptChunk(profileId, input, job, options);
        results[index] = scenes;
        log(`[ai-video] [${profileName}] ${job.density} chunk ${job.chunkIndex + 1}/${job.totalChunks} → ${scenes.length} scene(s)`);

        const done = results.filter(Boolean).length;
        const savedPath = await persistAiScenePromptsFile(input.workDir, input.youtubeVideoId, orderedScenes());
        log(`[ai-video] Scene prompts checkpoint → ${savedPath} (${done}/${jobs.length} chunk)`);
      }
    } catch (err) {
      failure ??= err;
      log(`[ai-video] [${profileName}] scene prompts aborted: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  try {
    await Promise.all(profiles.map(profile => runProfile(profile.id, profile.name)));
  } finally {
    await chromeProfilesService.closeSubProfiles(profiles.map(profile => profile.id));
  }

  if (failure !== undefined) throw failure;

  const allScenes = orderedScenes();
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
  const log = (msg: string) => {
    console.log(msg);
    input.onLog?.(msg);
  };

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
