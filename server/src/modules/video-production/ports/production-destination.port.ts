import type { ChannelLanguage } from '../../youtube-channels/channel-language.js';
import type {
  CaptionStyleKey,
  ReupAudioBackgroundImage,
  ReupAudioVideoType,
  AiSceneDensityMaxSec,
  VideoCreationOrder,
} from '../../youtube-channels/youtube-channels.types.js';
import type { VideoPrepareItem } from '../../youtube-channels/video-prepare.types.js';

export type ProductionPipelineType = 'reup_audio' | 'reup_video' | 'reup' | 'content_sale';

export interface ProductionVisualStyle {
  id: string;
  name: string;
  rule: string;
  niche: string;
}

export interface ProductionDestination {
  id: string;
  name: string;
  pipelineType: ProductionPipelineType;
  language: ChannelLanguage;
  /** Channel niche key, or `all` when unset. */
  niche: string;
  sourceChannels: string[];
  videoCreationOrder?: VideoCreationOrder;
  backgroundFootageSources?: string[];
  thumbnailStyleKey?: string;
  thumbnailBackgroundFile?: string;
  captionStyleKey?: CaptionStyleKey;
  /** Set for reup_audio channels only */
  reupAudioVideoType?: ReupAudioVideoType;
  reupAudioVisualStyleId?: string;
  reupAudioBackgroundImage?: ReupAudioBackgroundImage;
  celebrityId?: string;
  aiSceneDensityMaxSec?: AiSceneDensityMaxSec;
  useReferenceImage?: boolean;
  showAudioBar?: boolean;
  audioBarFile?: string;
  showSmallVideo?: boolean;
  smallVideoFile?: string;
  showSubscribe?: boolean;
  subscribeFile?: string;
  showChannelAvatar?: boolean;
  showDisclaimer?: boolean;
  disclaimerText?: string;
  descriptionDisclaimerText?: string;
  visualStyle?: ProductionVisualStyle;
  getVideoOutputDir(mediaId: string): string;
  getPreparedVideoIds(): Set<string>;
  trackPreparedVideo(item: VideoPrepareItem): void;
  ensurePrepareStore(): void;
}
