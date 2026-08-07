import type {
  Prompt,
  PromptCategory,
  PromptFormDraft,
  PromptLanguage,
  PromptOutputType,
  PromptSetListItem,
  PromptStepDraft,
} from '../types/prompt';
import { derivePromptKeyFromName } from './promptVariables';

const STEP_SUFFIX_PATTERN = /_step_(\d+)$/;

let stepLocalIdCounter = 0;

export function createStepLocalId(): string {
  stepLocalIdCounter += 1;
  return `step_${Date.now()}_${stepLocalIdCounter}`;
}

export function createEmptyStepDraft(): PromptStepDraft {
  return {
    localId: createStepLocalId(),
    id: null,
    key: '',
    outputType: 'text',
    description: '',
    template: '',
    templateParams: [],
    useReferenceImage: false,
    useChannelBackgroundImage: false,
  };
}

export function stripStepSuffix(key: string): string {
  return key.replace(STEP_SUFFIX_PATTERN, '');
}

export function parseStepNumber(key: string): number | null {
  const match = key.match(STEP_SUFFIX_PATTERN);
  if (!match) return null;
  return Number(match[1]);
}

export function promptSetGroupKey(language: PromptLanguage | string, name: string): string {
  return `${language}::${name.trim().toLowerCase()}`;
}

export function sortPromptSetMembers(members: Prompt[]): Prompt[] {
  return [...members].sort((a, b) => {
    const stepA = parseStepNumber(a.key);
    const stepB = parseStepNumber(b.key);
    if (stepA !== null && stepB !== null && stepA !== stepB) return stepA - stepB;
    if (stepA !== null && stepB === null) return -1;
    if (stepA === null && stepB !== null) return 1;
    return a.key.localeCompare(b.key);
  });
}

export function getPromptSetSiblings(prompt: Prompt, allPrompts: Prompt[]): Prompt[] {
  const name = prompt.name.trim().toLowerCase();
  const siblings = allPrompts.filter(
    (item) => item.language === prompt.language && item.name.trim().toLowerCase() === name,
  );
  return sortPromptSetMembers(siblings);
}

export function resolveCanonicalSetKey(members: Prompt[]): string {
  if (members.length === 0) return '';
  if (members.length === 1) return members[0]!.key;

  const stepKey = members.find((item) => STEP_SUFFIX_PATTERN.test(item.key));
  if (stepKey) return stripStepSuffix(stepKey.key);

  return [...members].sort((a, b) => a.key.localeCompare(b.key))[0]!.key;
}

export function groupPromptSets(prompts: Prompt[]): PromptSetListItem[] {
  const groups = new Map<string, Prompt[]>();

  for (const prompt of prompts) {
    const key = promptSetGroupKey(prompt.language, prompt.name);
    const existing = groups.get(key) ?? [];
    existing.push(prompt);
    groups.set(key, existing);
  }

  return [...groups.values()]
    .map((members) => {
      const sorted = sortPromptSetMembers(members);
      const primary = sorted[0]!;
      return {
        id: primary.id,
        name: primary.name,
        language: primary.language,
        category: primary.category,
        niche: primary.niche || 'all',
        key: resolveCanonicalSetKey(sorted),
        stepCount: sorted.length,
        isSystem: sorted.some((item) => item.isSystem),
        memberIds: sorted.map((item) => item.id),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function planStepKeys(baseKey: string, stepCount: number): string[] {
  const base = baseKey.trim() || 'new_prompt';
  if (stepCount <= 1) return [base];
  return Array.from({ length: stepCount }, (_, index) => `${base}_step_${index + 1}`);
}

export function resolveDraftBaseKey(draft: PromptFormDraft): string {
  const fromName = derivePromptKeyFromName(draft.name);
  if (!draft.steps.some((step) => step.id)) return fromName;

  const existingKeys = draft.steps.map((step) => step.key).filter(Boolean);
  if (existingKeys.length === 0) return fromName;

  const withStep = existingKeys.find((key) => STEP_SUFFIX_PATTERN.test(key));
  if (withStep) return stripStepSuffix(withStep);

  if (existingKeys.length === 1) return existingKeys[0]!;
  return fromName;
}

export function supportsReferenceImage(category: PromptCategory): boolean {
  return category === 'thumbnail' || category === 'image';
}

export function supportsChannelBackgroundImage(category: PromptCategory): boolean {
  return category === 'thumbnail';
}

export function resolveDraftOutputType(item: {
  outputType?: PromptOutputType;
  category: PromptCategory;
  key: string;
}): PromptOutputType {
  if (item.outputType === 'text' || item.outputType === 'image' || item.outputType === 'video') {
    return item.outputType;
  }
  if (item.category === 'image' || item.key === 'love_story') return 'image';
  return 'text';
}
