import fs from 'node:fs/promises';
import path from 'node:path';
import { extractTranscriptForMetadata } from '../../../../infrastructure/subtitle/srt-utils.js';
import { AppError } from '../../../../shared/http/errors.js';
import { chromeProfilesService } from '../../../chrome-profiles/chrome-profiles.service.js';
import { llmBrowserService } from '../../../llm-browser/llm-browser.service.js';
import { executePromptTemplate, getPromptTemplateArity } from '../../../prompts/prompts.file-store.js';
import { promptsRepository } from '../../../prompts/prompts.repository.js';
import { promptsSettingsService } from '../../../prompts/prompts-settings.service.js';
import type { PromptLanguage } from '../../../prompts/prompts.types.js';
import type { MetaLlmSession } from './meta-session.js';
import { tryParseMetadataResponse } from './meta-response.js';
import {
  isCelebrityWisdomNiche,
  type MetadataLlmOutput,
  type MetadataPersistedOutput,
  type VideoMetaOutput,
} from './metadata.types.js';

const METADATA_PROMPT_KEY = 'metadata';
const MAX_RETRIES = 3;

export type MetadataStatus = 'started' | 'retry';

export interface MetadataProgress {
  attempt: number;
  profileId: string;
  profileName: string;
  status: MetadataStatus;
}

export interface RunMetadataOptions {
  outputDir?: string;
  descriptionDisclaimer?: string;
  /** Channel niche key used to pick a niche-specific meta prompt. */
  niche?: string;
  /** Visual style rule from channel "Phong cách hình ảnh"; required when meta prompt arity >= 3. */
  imageStyle?: string;
  onProgress?: (progress: MetadataProgress) => void;
}

function logValidationFailure(attempt: number, reason: string): void {
  console.warn(`[run-metadata] attempt ${attempt}: validation failed (${reason})`);
}

function formatLogValue(value: unknown, maxLength = 80): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function pickPreferredMetadataPrompt<T extends { key: string }>(prompts: T[]): T | undefined {
  if (prompts.length === 0) return undefined;
  return prompts.find((item) => item.key === METADATA_PROMPT_KEY) ?? prompts[0];
}

/** True when a dedicated meta prompt exists for this channel niche (not the `all` fallback). */
export function hasNicheMetadataPrompt(language: PromptLanguage, channelNiche?: string): boolean {
  const niche = channelNiche?.trim() || 'all';
  if (niche === 'all') return false;
  return promptsRepository
    .findAll()
    .some(
      (item) =>
        item.category === 'meta' && item.language === language && (item.niche || 'all') === niche,
    );
}

export function resolveMetadataPrompt(
  language: PromptLanguage,
  channelNiche?: string,
): { key: string; niche: string } {
  const niche = channelNiche?.trim() || 'all';
  const metaPrompts = promptsRepository
    .findAll()
    .filter((item) => item.category === 'meta' && item.language === language);

  if (niche !== 'all') {
    const nicheMatches = metaPrompts.filter((item) => (item.niche || 'all') === niche);
    const nichePrompt = pickPreferredMetadataPrompt(nicheMatches);
    if (nichePrompt) {
      console.log(
        `[run-metadata] using niche prompt key="${nichePrompt.key}" niche="${nichePrompt.niche || niche}" language="${language}"`,
      );
      return { key: nichePrompt.key, niche: nichePrompt.niche || niche };
    }
  }

  const allMatches = metaPrompts.filter((item) => (item.niche || 'all') === 'all');
  const fallbackPrompt = pickPreferredMetadataPrompt(allMatches);
  if (!fallbackPrompt) {
    throw new AppError(
      `Metadata prompt not found for language "${language}"${niche !== 'all' ? ` (niche "${niche}" or all)` : ''}`,
      404,
      'PROMPT_NOT_FOUND',
    );
  }

  console.log(
    `[run-metadata] using fallback prompt key="${fallbackPrompt.key}" niche="all" language="${language}"` +
      (niche !== 'all' ? ` (no prompt for channel niche "${niche}")` : ''),
  );
  return { key: fallbackPrompt.key, niche: 'all' };
}

function pickWisdomPersistFields(parsed: MetadataLlmOutput): Partial<MetadataLlmOutput> {
  const fields: Partial<MetadataLlmOutput> = {};
  if (parsed.detected_topic !== undefined) fields.detected_topic = parsed.detected_topic;
  if (parsed.detected_name !== undefined) fields.detected_name = parsed.detected_name;
  if (parsed.framing !== undefined) fields.framing = parsed.framing;
  if (parsed.core_promise !== undefined) fields.core_promise = parsed.core_promise;
  if (parsed.recommended_title_index !== undefined) {
    fields.recommended_title_index = parsed.recommended_title_index;
  }
  if (parsed.thumbnail !== undefined) fields.thumbnail = parsed.thumbnail;
  if (parsed.image_generation_prompt !== undefined) {
    fields.image_generation_prompt = parsed.image_generation_prompt;
  }
  if (parsed.video_visual_prompt !== undefined) {
    fields.video_visual_prompt = parsed.video_visual_prompt;
  }
  return fields;
}

async function persistMetadataOutput(
  parsed: MetadataLlmOutput,
  sourceTitle: string,
  videoId: string,
  language: PromptLanguage,
  outputDir?: string,
  descriptionDisclaimer?: string,
): Promise<void> {
  if (!outputDir) return;

  const disclaimer = descriptionDisclaimer?.trim();
  const description = disclaimer
    ? `${parsed.metadata.description}\n\n${disclaimer}`
    : parsed.metadata.description;

  const outputPath = path.join(outputDir, 'video-meta.json');
  const output: MetadataPersistedOutput = {
    videoId,
    language,
    source_title: sourceTitle.trim(),
    detected_niche: parsed.detected_niche,
    metadata: {
      ...parsed.metadata,
      description,
    },
    alternative_titles: parsed.alternative_titles,
    ...pickWisdomPersistFields(parsed),
  };
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(
    `[run-metadata] saved: ${outputPath} (title: ${formatLogValue(parsed.metadata.title)}, source: ${formatLogValue(
      sourceTitle
    )}, niche: ${formatLogValue(parsed.detected_niche)})`
  );
}

function toVideoMetaOutput(
  parsed: MetadataLlmOutput,
  sourceTitle: string,
  descriptionDisclaimer?: string,
): VideoMetaOutput {
  const disclaimer = descriptionDisclaimer?.trim();
  const description = disclaimer
    ? `${parsed.metadata.description}\n\n${disclaimer}`
    : parsed.metadata.description;

  return {
    source_title: sourceTitle.trim(),
    detected_niche: parsed.detected_niche,
    metadata: {
      ...parsed.metadata,
      description,
    },
    alternative_titles: parsed.alternative_titles,
    ...pickWisdomPersistFields(parsed),
  };
}

export async function executeMetadata(
  session: MetaLlmSession,
  sourceTitle: string,
  srtPath: string,
  language: PromptLanguage,
  videoId: string,
  options?: RunMetadataOptions
): Promise<VideoMetaOutput> {
  if (language !== 'ja') {
    throw new AppError('Metadata generation is only supported for Japanese', 400, 'UNSUPPORTED_LANGUAGE');
  }

  const resolved = resolveMetadataPrompt(language, options?.niche);
  const promptKey = resolved.key;
  const parseNiche = isCelebrityWisdomNiche(options?.niche) ? options?.niche : resolved.niche;
  const transcript = await extractTranscriptForMetadata(srtPath);
  const promptArity = await getPromptTemplateArity(language, promptKey);
  const imageStyle = options?.imageStyle?.trim() ?? '';
  const templateArgs: unknown[] =
    promptArity >= 3 ? [sourceTitle, transcript, imageStyle] : [sourceTitle, transcript];

  if (promptArity >= 3 && !imageStyle) {
    throw new AppError(
      'Phong cách hình ảnh (visual style) is required for this metadata prompt (image_style)',
      400,
      'MISSING_IMAGE_STYLE',
    );
  }

  let lastReason = 'unknown error';

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    options?.onProgress?.({
      attempt,
      profileId: session.profileId,
      profileName: session.profileName,
      status: attempt === 1 ? 'started' : 'retry',
    });

    try {
      const userPrompt = await executePromptTemplate(language, promptKey, templateArgs);
      const response = await llmBrowserService.chat(session.profileId, session.provider, userPrompt, undefined, {
        submitWith: 'enter',
        pasteStrategy: 'direct',
      });

      const parsed = tryParseMetadataResponse(response, { niche: parseNiche });
      if (parsed) {
        await persistMetadataOutput(
          parsed,
          sourceTitle,
          videoId,
          language,
          options?.outputDir,
          options?.descriptionDisclaimer,
        );
        return toVideoMetaOutput(parsed, sourceTitle, options?.descriptionDisclaimer);
      }

      lastReason =
        parseNiche && parseNiche !== 'all'
          ? isCelebrityWisdomNiche(parseNiche)
            ? 'invalid JSON or missing metadata/thumbnail.image_generation_prompt'
            : 'invalid JSON or missing metadata/thumbnail.image_generation_prompt/video_visual_prompt'
          : 'invalid JSON or schema mismatch';
      logValidationFailure(attempt, lastReason);
    } catch (err) {
      lastReason = err instanceof Error ? err.message : 'unknown error';
      logValidationFailure(attempt, lastReason);
    }
  }

  throw new AppError(`Metadata generation failed after ${MAX_RETRIES} attempts: ${lastReason}`, 502, 'METADATA_FAILED');
}

export async function runMetadata(
  sourceTitle: string,
  srtPath: string,
  language: PromptLanguage,
  videoId: string,
  options?: RunMetadataOptions
): Promise<VideoMetaOutput> {
  const provider = promptsSettingsService.get().defaultLlmProvider;
  const profile = chromeProfilesService.pickSubProfile();

  console.log(`[run-metadata] Mở Chrome profile ${profile.name} cho metadata...`);

  try {
    await llmBrowserService.open(profile.id, provider);

    return await executeMetadata(
      { profileId: profile.id, profileName: profile.name, provider },
      sourceTitle,
      srtPath,
      language,
      videoId,
      options
    );
  } finally {
    await chromeProfilesService.closeSubProfiles([profile.id]);
  }
}
