import { AppError } from '../../shared/http/errors.js';
import { visualStylesService } from '../visual-styles/visual-styles.service.js';
import type { ProductionVisualStyle } from '../video-production/ports/production-destination.port.js';
import type { ChannelLanguage } from './channel-language.js';
import type { ReupAudioVideoType, YoutubeChannel } from './youtube-channels.types.js';

export function validateReupAudioVisualStyleId(
  _videoType: ReupAudioVideoType,
  styleId: string,
  _language: ChannelLanguage,
): void {
  visualStylesService.getById(styleId.trim());
}

export async function resolveReupAudioVisualStyle(channel: YoutubeChannel): Promise<ProductionVisualStyle> {
  const styleId = channel.reupAudioVisualStyleId?.trim();
  if (!styleId || !channel.reupAudioVideoType) {
    throw new AppError('Reup Audio channel is missing visual style config', 400, 'VALIDATION_ERROR');
  }

  const visualStyle = visualStylesService.getById(styleId);
  return {
    id: visualStyle.id,
    name: visualStyle.name,
    rule: visualStyle.rule,
    niche: visualStyle.niche,
  };
}
