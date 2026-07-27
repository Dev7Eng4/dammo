import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'playwright';
import type { FlowToolVisual } from '../../../../infrastructure/llm-browser/llm-browser.types.js';
import {
  connectPlaywrightToGpmProfile,
  disconnectGpmPlaywright,
  type GpmPlaywrightConnection,
} from '../../../../infrastructure/gpm/gpm-playwright.connector.js';
import type { GpmProfile } from '../../../../infrastructure/gpm/gpm-api.client.js';
import { AppError } from '../../../../shared/http/errors.js';
import {
  closeChromeProfiles,
  createChromeProfilePage,
  openChromeProfile,
} from '../../../chrome-profiles/chrome-profile.runner.js';
import { chromeProfilesService } from '../../../chrome-profiles/chrome-profiles.service.js';
import type { ChromeProfile } from '../../../chrome-profiles/chrome-profiles.types.js';
import { gpmManagerService } from '../../../gpm-manager/gpm-manager.service.js';
import { generateImagesViaToolWithFailover } from '../../../llm-browser/flow-profile-failover.js';
import { llmBrowserService } from '../../../llm-browser/llm-browser.service.js';
import { metaBrowserService } from '../../../llm-browser/meta-browser.service.js';
import { executePromptTemplate } from '../../../prompts/prompts.file-store.js';
import { promptsSettingsService } from '../../../prompts/prompts-settings.service.js';
import type { PromptLanguage } from '../../../prompts/prompts.types.js';
import {
  AI_VIDEO_CHARACTER_DESIGN_MAX_TRANSCRIPT_SEC,
  CHARACTER_REFERENCES_FILENAME,
  CREATE_CHARACTERS_DESIGN_PROMPT_KEY,
  IMAGE_REFERENCES_DIRNAME,
} from './ai-video.constants.js';
import { tryParseAiVideoCharacterResponse } from './ai-video-scene-response.js';
import {
  clipTranscriptCuesToMaxSec,
  loadTranscriptCuesFromSrt,
} from './ai-video-transcript.js';
import type {
  AiVideoCharacterReference,
  AiVideoCharacterReferencesFile,
  AiVideoVisualStyle,
} from './ai-video.types.js';

const MAX_LLM_RETRIES = 3;
const FLOW_TOOL_TIMEOUT_MS = 300_000;
const META_IMAGE_TIMEOUT_MS = 300_000;
const META_IMAGE_MAX_RETRIES = 3;
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const;

export interface GenerateCharacterReferencesInput {
  workDir: string;
  youtubeVideoId: string;
  visualStyle: AiVideoVisualStyle;
  subtitlePath: string;
  language: PromptLanguage;
  maxTranscriptSec?: number;
  onLog?: (msg: string) => void;
}

export interface GenerateCharacterReferencesResult {
  characters: AiVideoCharacterReference[];
  filePath: string;
  imageReferencesDir: string;
  generatedCount: number;
  skippedCount: number;
  failedCount: number;
}

export function sanitizeCharacterId(id: string): string {
  const sanitized = id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return sanitized || 'character';
}

export function resolveCharacterReferencesFilePath(workDir: string): string {
  return path.join(workDir, CHARACTER_REFERENCES_FILENAME);
}

export function resolveImageReferencesDir(workDir: string): string {
  return path.join(workDir, IMAGE_REFERENCES_DIRNAME);
}

function buildCharacterReferencesFile(
  youtubeVideoId: string,
  characters: AiVideoCharacterReference[],
): AiVideoCharacterReferencesFile {
  return {
    youtubeVideoId,
    generatedAt: new Date().toISOString(),
    characterCount: characters.length,
    characters,
  };
}

export async function persistCharacterReferencesFile(
  workDir: string,
  youtubeVideoId: string,
  characters: AiVideoCharacterReference[],
): Promise<string> {
  await fs.mkdir(workDir, { recursive: true });
  const filePath = resolveCharacterReferencesFilePath(workDir);
  const payload = buildCharacterReferencesFile(youtubeVideoId, characters);
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return filePath;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findExistingCharacterImage(
  imageReferencesDir: string,
  characterId: string,
): Promise<string | undefined> {
  const base = sanitizeCharacterId(characterId);
  for (const ext of IMAGE_EXTENSIONS) {
    const candidate = path.join(imageReferencesDir, `${base}${ext}`);
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export async function resolveCharacterReferenceImagePaths(
  workDir: string,
  referenceIds: string[],
  onLog?: (msg: string) => void,
): Promise<string[]> {
  const imageReferencesDir = resolveImageReferencesDir(workDir);
  const paths: string[] = [];

  for (const id of referenceIds) {
    const trimmed = id.trim();
    if (!trimmed) continue;

    const found = await findExistingCharacterImage(imageReferencesDir, trimmed);
    if (found) {
      paths.push(path.resolve(found));
      continue;
    }

    const message = `[ai-video] Character reference image not found for id: ${trimmed}`;
    console.warn(message);
    onLog?.(message);
  }

  return paths;
}

async function generateCharacterPromptsViaLlm(
  input: GenerateCharacterReferencesInput,
  transcriptJson: string,
  log: (msg: string) => void,
): Promise<AiVideoCharacterReference[]> {
  const userPrompt = await executePromptTemplate(input.language, CREATE_CHARACTERS_DESIGN_PROMPT_KEY, [
    transcriptJson,
    input.visualStyle.rule,
  ]);

  const profile = chromeProfilesService.pickSubProfile();
  log(`[ai-video] Mở Chrome profile ${profile.name} cho character design...`);

  let lastReason = 'unknown error';

  try {
    await llmBrowserService.open(profile.id, promptsSettingsService.get().defaultLlmProvider);

    for (let attempt = 1; attempt <= MAX_LLM_RETRIES; attempt += 1) {
      log(`[ai-video] Character design LLM attempt ${attempt}/${MAX_LLM_RETRIES}...`);
      try {
        const response = await llmBrowserService.chat(
          profile.id,
          promptsSettingsService.get().defaultLlmProvider,
          userPrompt,
          undefined,
          {
            submitWith: 'enter',
            pasteStrategy: 'direct',
          },
        );

        const parsed = tryParseAiVideoCharacterResponse(response);
        if (parsed) {
          return parsed;
        }
        lastReason = 'invalid JSON or schema mismatch';
      } catch (err) {
        lastReason = err instanceof Error ? err.message : 'unknown error';
      }
    }
  } finally {
    await chromeProfilesService.closeSubProfiles([profile.id]);
  }

  throw new AppError(
    `Character design prompt generation failed after ${MAX_LLM_RETRIES} attempts: ${lastReason}`,
    502,
    'AI_CHARACTER_PROMPT_FAILED',
  );
}

async function generateCharacterImagesViaFlow(
  characters: AiVideoCharacterReference[],
  imageReferencesDir: string,
  log: (msg: string) => void,
): Promise<{ generatedCount: number; failedCount: number }> {
  let generatedCount = 0;
  let failedCount = 0;

  for (const character of characters) {
    const name = sanitizeCharacterId(character.id);
    const outputPath = path.join(imageReferencesDir, `${name}.jpg`);
    if (await fileExists(outputPath)) {
      continue;
    }

    const visuals: FlowToolVisual[] = [{ name, prompt: character.prompt }];
    log(`[ai-video] Flow character image → ${name}`);

    try {
      await generateImagesViaToolWithFailover(visuals, {
        outputDir: imageReferencesDir,
        timeoutMs: FLOW_TOOL_TIMEOUT_MS,
      });
      if (await fileExists(outputPath)) {
        generatedCount += 1;
      } else {
        failedCount += 1;
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      log(`[ai-video] Flow character image failed for ${name}: ${reason}`);
      failedCount += 1;
    }
  }

  return { generatedCount, failedCount };
}

async function generateCharacterImagesViaMeta(
  characters: AiVideoCharacterReference[],
  imageReferencesDir: string,
  log: (msg: string) => void,
): Promise<{ generatedCount: number; failedCount: number }> {
  const pending = [];
  for (const character of characters) {
    const name = sanitizeCharacterId(character.id);
    const outputPath = path.join(imageReferencesDir, `${name}.jpg`);
    if (!(await fileExists(outputPath))) {
      pending.push({ character, name, outputPath });
    }
  }

  if (pending.length === 0) {
    return { generatedCount: 0, failedCount: 0 };
  }

  const chromeProfiles = chromeProfilesService.listMainProfiles();
  let gpmProfiles: GpmProfile[] = [];
  try {
    gpmProfiles = await gpmManagerService.listMetaEnabledProfiles();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log(`[ai-video] GPM meta profiles unavailable for characters: ${reason}`);
  }
  let page: Page | null = null;
  let gpmConnection: GpmPlaywrightConnection | null = null;
  let chromeProfileId: string | undefined;

  try {
    if (chromeProfiles.length > 0) {
      const profile: ChromeProfile = chromeProfiles[0];
      chromeProfileId = profile.id;
      log(`[ai-video] Mở Chrome main profile ${profile.name} cho Meta character images...`);
      await openChromeProfile(profile.id, profile.userDataDir);
      page = await createChromeProfilePage(profile.id);
      await metaBrowserService.openOnPage(page);
    } else if (gpmProfiles.length > 0) {
      const profile = gpmProfiles[0];
      log(`[ai-video] Start GPM profile ${profile.name} cho Meta character images...`);
      gpmConnection = await connectPlaywrightToGpmProfile(profile.id);
      page = gpmConnection.page;
      await metaBrowserService.openOnPage(page);
    } else {
      throw new AppError('No Meta image profiles available for character images', 400, 'NO_META_PROFILE');
    }

    let generatedCount = 0;
    let failedCount = 0;

    for (const job of pending) {
      log(`[ai-video] Meta character image → ${job.name}`);
      let succeeded = false;

      for (let attempt = 1; attempt <= META_IMAGE_MAX_RETRIES; attempt += 1) {
        try {
          const response = await metaBrowserService.generateMediaOnPage(page!, job.character.prompt, {
            mediaKind: 'image',
            outputDir: imageReferencesDir,
            fileName: `${job.name}.jpg`,
            timeoutMs: META_IMAGE_TIMEOUT_MS,
          });
          const savedPath = response.mediaAssets?.find(asset => asset.localPath)?.localPath;
          if (!savedPath || !(await fileExists(savedPath))) {
            throw new AppError(`Meta image generation failed for ${job.name}`, 502, 'AI_CHARACTER_IMAGE_FAILED');
          }
          generatedCount += 1;
          succeeded = true;
          break;
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          if (attempt === META_IMAGE_MAX_RETRIES) {
            log(`[ai-video] bỏ qua character ${job.name} sau ${META_IMAGE_MAX_RETRIES} lần: ${reason}`);
            failedCount += 1;
          } else {
            log(
              `[ai-video] character ${job.name} attempt ${attempt}/${META_IMAGE_MAX_RETRIES} failed → retry (${reason})`,
            );
          }
        }
      }

      if (!succeeded) {
        // already counted in failedCount
      }
    }

    return { generatedCount, failedCount };
  } finally {
    if (gpmConnection) {
      await disconnectGpmPlaywright(gpmConnection).catch(() => undefined);
    }
    if (chromeProfileId) {
      await closeChromeProfiles([chromeProfileId]);
    }
  }
}

async function attachCharacterImagePaths(
  characters: AiVideoCharacterReference[],
  workDir: string,
  imageReferencesDir: string,
): Promise<AiVideoCharacterReference[]> {
  const attached: AiVideoCharacterReference[] = [];

  for (const character of characters) {
    const absolutePath = await findExistingCharacterImage(imageReferencesDir, character.id);
    if (!absolutePath) {
      attached.push(character);
      continue;
    }
    attached.push({
      ...character,
      path: path.relative(workDir, absolutePath).replace(/\\/g, '/'),
    });
  }

  return attached;
}

export async function generateCharacterReferences(
  input: GenerateCharacterReferencesInput,
): Promise<GenerateCharacterReferencesResult> {
  const log = (msg: string) => {
    console.log(msg);
    input.onLog?.(msg);
  };

  const maxTranscriptSec = input.maxTranscriptSec ?? AI_VIDEO_CHARACTER_DESIGN_MAX_TRANSCRIPT_SEC;
  const allCues = await loadTranscriptCuesFromSrt(input.subtitlePath);
  const cues = clipTranscriptCuesToMaxSec(allCues, maxTranscriptSec);

  if (cues.length === 0) {
    throw new AppError('No transcript cues available for character design', 400, 'INVALID_INPUT');
  }

  log(
    `[ai-video] Character design using first ${maxTranscriptSec}s transcript (${cues.length} cue(s))`,
  );

  const characters = await generateCharacterPromptsViaLlm(input, JSON.stringify(cues), log);
  log(`[ai-video] Character design → ${characters.length} character(s)`);

  const imageReferencesDir = resolveImageReferencesDir(input.workDir);
  await fs.mkdir(imageReferencesDir, { recursive: true });

  let skippedCount = 0;
  for (const character of characters) {
    if (await findExistingCharacterImage(imageReferencesDir, character.id)) {
      skippedCount += 1;
    }
  }

  let generatedCount = 0;
  let failedCount = 0;

  if (characters.length > 0) {
    const imageProvider = promptsSettingsService.get().defaultImageProvider;
    const pendingCount = characters.length - skippedCount;
    log(
      `[ai-video] Generating ${pendingCount} character image(s) via ${imageProvider} (${skippedCount} skipped) → ${imageReferencesDir}`,
    );

    if (pendingCount > 0) {
      if (imageProvider === 'flow') {
        const mains = chromeProfilesService.listMainProfiles();
        log(`[ai-video] Flow character images via main profile(s): ${mains.map(p => p.name).join(', ')}`);
        try {
          const flowResult = await generateCharacterImagesViaFlow(characters, imageReferencesDir, log);
          generatedCount = flowResult.generatedCount;
          failedCount = flowResult.failedCount;
        } finally {
          await closeChromeProfiles(mains.map(profile => profile.id));
        }
      } else {
        const metaResult = await generateCharacterImagesViaMeta(characters, imageReferencesDir, log);
        generatedCount = metaResult.generatedCount;
        failedCount = metaResult.failedCount;
      }
    }
  } else {
    log('[ai-video] No characters to generate images for');
  }

  const withPaths = await attachCharacterImagePaths(characters, input.workDir, imageReferencesDir);
  const filePath = await persistCharacterReferencesFile(input.workDir, input.youtubeVideoId, withPaths);
  log(`[ai-video] Character references saved → ${filePath}`);

  return {
    characters: withPaths,
    filePath,
    imageReferencesDir,
    generatedCount,
    skippedCount,
    failedCount,
  };
}
