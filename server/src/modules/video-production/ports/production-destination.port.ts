import type { ChannelLanguage } from '../../youtube-channels/channel-language.js';
import type { VideoPrepareItem } from '../../youtube-channels/video-prepare.types.js';

export type ProductionPipelineType = 'reup_audio' | 'reup_video' | 'reup' | 'content_sale';

export interface ProductionDestination {
  id: string;
  name: string;
  pipelineType: ProductionPipelineType;
  language: ChannelLanguage;
  sourceChannels: string[];
  backgroundFootageSources?: string[];
  thumbnailStyleKey?: string;
  getVideoOutputDir(mediaId: string): string;
  getPreparedVideoIds(): Set<string>;
  trackPreparedVideo(item: VideoPrepareItem): void;
  ensurePrepareStore(): void;
}
