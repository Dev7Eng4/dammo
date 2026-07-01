import { AppError } from '../../shared/http/errors.js';
import { readPromptSource } from '../prompts/prompts.file-store.js';
import { promptsService } from '../prompts/prompts.service.js';
import { visualStylesService } from '../visual-styles/visual-styles.service.js';
import type { ProductionVisualStyle } from '../video-production/ports/production-destination.port.js';
import type { ChannelLanguage } from './channel-language.js';
import type { ReupAudioVideoType, YoutubeChannel } from './youtube-channels.types.js';

export function validateReupAudioVisualStyleId(
  videoType: ReupAudioVideoType,
  styleId: string,
  language: ChannelLanguage,
): void {
  const trimmed = styleId.trim();

  if (videoType === 'ai') {
    const prompt = promptsService.getById(trimmed);
    if (prompt.category !== 'image') {
      throw new AppError('Video style must be an image prompt', 400, 'VALIDATION_ERROR');
    }
    if (prompt.language !== language) {
      throw new AppError('Image prompt language must match channel language', 400, 'VALIDATION_ERROR');
    }
    return;
  }

  visualStylesService.getById(trimmed);
}

export async function resolveReupAudioVisualStyle(channel: YoutubeChannel): Promise<ProductionVisualStyle> {
  const styleId = channel.reupAudioVisualStyleId?.trim();
  if (!styleId || !channel.reupAudioVideoType) {
    throw new AppError('Reup Audio channel is missing visual style config', 400, 'VALIDATION_ERROR');
  }

  if (channel.reupAudioVideoType === 'ai') {
    const prompt = promptsService.getById(styleId);
    const template = await readPromptSource(prompt.language, prompt.key);
    return {
      id: prompt.id,
      name: prompt.name,
      rule: template,
      niche: channel.niche,
    };
  }

  const visualStyle = visualStylesService.getById(styleId);
  return {
    id: visualStyle.id,
    name: visualStyle.name,
    rule: visualStyle.rule,
    niche: visualStyle.niche,
  };
}
