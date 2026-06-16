export type SourcePlatform = 'youtube' | 'tiktok' | 'facebook';
export type SourcePurpose =
  | 'trend_tracking'
  | 'idea_reference'
  | 'licensed_source'
  | 'competitor_tracking'
  | 'reup'
  | 'background_footage';
export type SourceRiskLevel = 'low' | 'medium' | 'high';
export type SourceVideoDurationFilter = 'all' | 'under_1m' | '1m_10m' | '10m_30m' | 'over_30m';

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

export interface SourceChannelsStore {
  sources: SourceChannel[];
}

export interface SourceVideoRecord {
  id: string;
  title: string;
  url: string;
  viewCount?: number;
  duration?: number;
}

export interface SourceVideosStore {
  sourceId: string;
  channelId?: string;
  fetchedAt: string;
  videos: SourceVideoRecord[];
}

export interface CreateSourceChannelInput {
  url: string;
}
