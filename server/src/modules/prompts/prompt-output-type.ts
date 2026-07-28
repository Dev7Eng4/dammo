import type { PromptOutputType, PromptSet } from './prompts.types.js';

export function resolvePromptOutputType(
  set: Pick<PromptSet, 'category' | 'key' | 'steps'> & { outputType?: PromptOutputType },
): PromptOutputType {
  if (set.outputType === 'text' || set.outputType === 'image' || set.outputType === 'video') {
    return set.outputType;
  }

  const firstStepType = set.steps?.[0]?.outputType;
  if (firstStepType === 'text' || firstStepType === 'image' || firstStepType === 'video') {
    return firstStepType;
  }

  if (set.category === 'image' || set.key === 'love_story') {
    return 'image';
  }

  return 'text';
}
