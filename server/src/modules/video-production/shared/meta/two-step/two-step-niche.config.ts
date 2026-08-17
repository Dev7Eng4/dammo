import fs from 'node:fs';
import { promptTemplateFile } from '../../../../../config/paths.js';
import { promptsRepository } from '../../../../prompts/prompts.repository.js';
import type { PromptLanguage, PromptSet } from '../../../../prompts/prompts.types.js';
import { isDramaNiche } from '../metadata.types.js';

export interface TwoStepNicheConfig {
  nicheId: string;
  promptBaseKey: string;
  logLabel: string;
  /** When true, step-2 must include general_background.prompt → video_visual_prompt. */
  requireGeneralBackground: boolean;
}

function buildPromptKey(baseKey: string, step: number, stepCount: number): string {
  if (stepCount <= 1 && step === 1) return baseKey;
  return `${baseKey}_step_${step}`;
}

function resolveStep2Key(set: PromptSet): string {
  const step2 = [...set.steps].sort((a, b) => a.step - b.step).find(step => step.step === 2);
  if (step2?.key) return step2.key;
  return buildPromptKey(set.baseKey, 2, set.steps.length);
}

function inferRequireGeneralBackground(language: PromptLanguage, set: PromptSet): boolean {
  if (typeof set.requireGeneralBackground === 'boolean') {
    return set.requireGeneralBackground;
  }

  const step2Key = resolveStep2Key(set);
  const candidates =
    language === 'all'
      ? [promptTemplateFile('all', step2Key)]
      : [promptTemplateFile(language, step2Key), promptTemplateFile('all', step2Key)];

  for (const filePath of candidates) {
    try {
      const source = fs.readFileSync(filePath, 'utf8');
      return source.includes('general_background');
    } catch {
      // try next candidate
    }
  }

  return false;
}

function logLabelFromBaseKey(baseKey: string): string {
  return baseKey.replace(/^metadata_/, '').replace(/_/g, '-') || baseKey;
}

/**
 * Resolve shared 2-step meta config from the prompts catalog.
 * Drama keeps a dedicated runner and is excluded here.
 */
export function getTwoStepNicheConfig(
  language: PromptLanguage,
  niche?: string,
): TwoStepNicheConfig | undefined {
  const nicheId = niche?.trim() || '';
  if (!nicheId || nicheId === 'all') return undefined;
  if (isDramaNiche(nicheId)) return undefined;

  const set = promptsRepository.findMetaSetForNiche(language, nicheId);
  if (!set || set.steps.length !== 2) return undefined;

  return {
    nicheId,
    promptBaseKey: set.baseKey,
    logLabel: logLabelFromBaseKey(set.baseKey),
    requireGeneralBackground: inferRequireGeneralBackground(language, set),
  };
}

export function isTwoStepNicheMetadata(language: PromptLanguage, niche?: string): boolean {
  return getTwoStepNicheConfig(language, niche) != null;
}

/** Thumbnail-only 2-step niches (no video_visual_prompt / general_background). */
export function isThumbnailOnlyTwoStepNiche(language: PromptLanguage, niche?: string): boolean {
  const config = getTwoStepNicheConfig(language, niche);
  return config != null && !config.requireGeneralBackground;
}
