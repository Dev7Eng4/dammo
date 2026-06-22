import type { Prompt, PromptOutputType } from './prompts.types.js';

export function resolvePromptOutputType(prompt: Pick<Prompt, 'outputType' | 'category' | 'key'>): PromptOutputType {
  if (prompt.outputType === 'text' || prompt.outputType === 'image') {
    return prompt.outputType;
  }

  if (prompt.category === 'image' || prompt.key === 'love_story') {
    return 'image';
  }

  return 'text';
}
