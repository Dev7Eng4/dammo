export type SourcePlatform = 'youtube' | 'tiktok' | 'facebook';
export type SourcePurpose =
  | 'trend_tracking'
  | 'idea_reference'
  | 'licensed_source'
  | 'competitor_tracking'
  | 'reup'
  | 'background_footage';
export type SourceRiskLevel = 'low' | 'medium' | 'high';

export interface MappedOwnedChannel {
  id: string;
  name: string;
}

export interface SourceActiveProject {
  id: string;
  name: string;
  status: string;
  statusDetail: string;
}

export interface SourceChannel {
  id: string;
  platform: SourcePlatform;
  name: string;
  url: string;
  fullUrl: string;
  niche: string;
  purpose: SourcePurpose;
  riskLevel: SourceRiskLevel;
  mappedOwnedChannels: MappedOwnedChannel[];
  activeProjects: SourceActiveProject[];
  notes?: string;
  videoCount?: number;
  subscriberCount?: number;
  description?: string;
  channelId?: string;
  metadataFetchedAt?: string;
}

export interface SourceChannelVideo {
  id: string;
  title: string;
  url: string;
  viewCount?: number;
  duration?: number;
}

export interface SourceChannelVideosResponse {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  items: SourceChannelVideo[];
}

export interface SourceChannelsResponse {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  items: SourceChannel[];
}

export type SourcePlatformFilter = 'all' | SourcePlatform;
export type SourcePurposeFilter = 'all' | SourcePurpose;
export type SourceRiskFilter = 'all' | SourceRiskLevel;
export type SourceVideoDurationFilter = 'all' | 'under_8m' | '8m_30m' | '30m_60m' | 'over_60m';

export interface CreateSourceChannelPayload {
  url: string;
  purpose: SourcePurpose;
}

export interface UpdateSourceChannelPayload {
  notes?: string;
  bumpRisk?: true;
}

export interface AddSourceChannelFormValues {
  url: string;
  purpose: SourcePurpose | '';
}
