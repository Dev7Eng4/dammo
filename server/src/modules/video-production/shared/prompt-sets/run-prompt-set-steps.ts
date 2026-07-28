import path from 'node:path';
import { AppError } from '../../../../shared/http/errors.js';
import { chromeProfilesService } from '../../../chrome-profiles/chrome-profiles.service.js';
import { llmBrowserService } from '../../../llm-browser/llm-browser.service.js';
import { executePromptSetStepTemplate } from '../../../prompts/prompts.file-store.js';
import { promptsSettingsService } from '../../../prompts/prompts-settings.service.js';
import type { PromptSet, PromptStep } from '../../../prompts/prompts.types.js';
import type { PromptLanguage } from '../../../prompts/prompts.types.js';
import { runFlowImageGeneration } from '../thumbnail/hero-image.js';

export interface PromptSetRunContext {
  workDir: string;
  language: PromptLanguage;
  sourceTitle?: string;
  transcriptText?: string;
  title?: string;
  summary?: string;
  visualStyle?: string;
  referencePaths?: string[];
  channelBackgroundPaths?: string[];
  /** Accumulated LLM text from last text step */
  lastText?: string;
  lastParsed?: unknown;
  imagePaths?: string[];
  videoPaths?: string[];
  [key: string]: unknown;
}

export interface RunPromptSetStepsOptions {
  /** Limit to specific step orders; default = all sorted by order */
  stepOrders?: number[];
}

function sortedSteps(set: PromptSet): PromptStep[] {
  return [...set.steps].sort((a, b) => a.order - b.order);
}

function buildTemplateArgs(step: PromptStep, ctx: PromptSetRunContext): unknown[] {
  if (!step.templateParams?.length) {
    // Common positional fallbacks for legacy templates
    if (ctx.sourceTitle != null && ctx.transcriptText != null) {
      return [ctx.sourceTitle, ctx.transcriptText];
    }
    if (ctx.title != null) {
      return [ctx.title];
    }
    if (ctx.transcriptText != null) {
      return [ctx.transcriptText];
    }
    return [];
  }

  return step.templateParams.map(name => {
    const value = ctx[name];
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    return JSON.stringify(value);
  });
}

function tryParseJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    return undefined;
  }
}

async function runTextStep(
  set: PromptSet,
  step: PromptStep,
  ctx: PromptSetRunContext,
): Promise<PromptSetRunContext> {
  const args = buildTemplateArgs(step, ctx);
  const userPrompt = await executePromptSetStepTemplate(ctx.language, set.key, step.order, args);
  if (!userPrompt.trim()) {
    throw new AppError(`Empty prompt for set ${set.key} step ${step.order}`, 500, 'PROMPT_EMPTY');
  }

  const provider = promptsSettingsService.get().defaultLlmProvider;
  const profile = chromeProfilesService.pickSubProfile();

  try {
    await llmBrowserService.open(profile.id, provider);
    const response = await llmBrowserService.chat(profile.id, provider, userPrompt, undefined, {
      submitWith: 'enter',
      pasteStrategy: 'direct',
    });
    const content = response.content?.trim() || response.codeBlocks?.at(-1)?.trim() || '';
    const next: PromptSetRunContext = {
      ...ctx,
      lastText: content,
    };

    if (step.outputSchema) {
      const parsed = tryParseJson(content);
      if (parsed !== undefined) {
        next.lastParsed = parsed;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          Object.assign(next, parsed as Record<string, unknown>);
        }
      }
    }

    return next;
  } finally {
    await chromeProfilesService.closeSubProfiles([profile.id]);
  }
}

async function runImageStep(
  set: PromptSet,
  step: PromptStep,
  ctx: PromptSetRunContext,
): Promise<PromptSetRunContext> {
  const args = buildTemplateArgs(step, ctx);
  const promptText =
    (await executePromptSetStepTemplate(ctx.language, set.key, step.order, args)).trim() ||
    ctx.lastText?.trim() ||
    '';

  if (!promptText) {
    throw new AppError(`Empty image prompt for set ${set.key} step ${step.order}`, 500, 'PROMPT_EMPTY');
  }

  const referencePaths: string[] = [];
  if (step.useReferenceImage && ctx.referencePaths?.length) {
    referencePaths.push(...ctx.referencePaths);
  }
  if (step.useChannelBackgroundImage && ctx.channelBackgroundPaths?.length) {
    referencePaths.push(...ctx.channelBackgroundPaths);
  }

  const fileName = `prompt-set-${set.key}-step-${step.order}.jpg`;
  const result = await runFlowImageGeneration(promptText, ctx.workDir, {
    fileName,
    ...(referencePaths.length > 0 ? { referenceImagePaths: referencePaths } : {}),
  });

  const imagePaths = [...(ctx.imagePaths ?? []), result.imagePath];
  return {
    ...ctx,
    imagePaths,
    lastText: promptText,
    // Common pipeline alias
    thumbnailPath: path.join(ctx.workDir, 'thumbnail.jpg') === result.imagePath ? result.imagePath : ctx.thumbnailPath,
  };
}

async function runVideoStep(
  set: PromptSet,
  step: PromptStep,
  ctx: PromptSetRunContext,
): Promise<PromptSetRunContext> {
  // Video provider wiring stays on specialized callers; mark skip with rendered prompt for now.
  const args = buildTemplateArgs(step, ctx);
  const promptText = await executePromptSetStepTemplate(ctx.language, set.key, step.order, args);
  console.warn(
    `[prompt-sets] video step ${set.key}/${step.order} rendered (${promptText.length} chars); use specialized video runner`,
  );
  return { ...ctx, lastText: promptText };
}

/**
 * Run PromptSet steps in order. Text steps call LLM; image steps call Flow; video logs for specialized runners.
 */
export async function runPromptSetSteps(
  set: PromptSet,
  ctx: PromptSetRunContext,
  options?: RunPromptSetStepsOptions,
): Promise<PromptSetRunContext> {
  const steps = sortedSteps(set).filter(step =>
    options?.stepOrders ? options.stepOrders.includes(step.order) : true,
  );

  let current = { ...ctx, language: ctx.language || set.language };
  for (const step of steps) {
    console.log(`[prompt-sets] Running ${set.key} step ${step.order} (${step.outputType})`);
    if (step.outputType === 'text') {
      current = await runTextStep(set, step, current);
    } else if (step.outputType === 'image') {
      current = await runImageStep(set, step, current);
    } else if (step.outputType === 'video') {
      current = await runVideoStep(set, step, current);
    }
  }
  return current;
}
