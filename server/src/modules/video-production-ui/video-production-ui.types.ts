export type ProductionVideoStatus = 'Prepared' | 'Created';

export interface ProductionVideoListItem {
  channelId: string;
  channelName: string;
  videoId: string;
  title: string;
  status: ProductionVideoStatus;
  sceneCount: number;
  hasScenes: boolean;
  thumbnailUrl: string | null;
}

export interface ProductionSceneItem {
  index: number;
  prompt: string;
  startTime: string;
  endTime: string;
  durationSec: number;
  imageUrl: string | null;
  references?: string[];
}

export interface ProductionScenesResponse {
  channelId: string;
  videoId: string;
  title: string;
  status: ProductionVideoStatus;
  generatedAt: string | null;
  sceneCount: number;
  scenes: ProductionSceneItem[];
}

export interface ProductionSceneImageAsset {
  filePath: string;
  contentType: string;
  size: number;
}

export type ProductionTranscriptSource = 'transcript-updated.srt' | 'transcript.srt';

export interface ProductionTranscriptCue {
  index: number;
  startTime: string;
  endTime: string;
  text: string;
}

export interface ProductionTranscriptResponse {
  channelId: string;
  videoId: string;
  source: ProductionTranscriptSource | null;
  cues: ProductionTranscriptCue[];
}

export interface ProductionCharacterItem {
  id: string;
  name: string;
  description: string;
  prompt: string;
  imageUrl: string | null;
}

export interface ProductionCharactersResponse {
  channelId: string;
  videoId: string;
  generatedAt: string | null;
  characters: ProductionCharacterItem[];
}

export interface ProductionMetadataResponse {
  channelId: string;
  videoId: string;
  title: string;
  description: string;
  tags: string[];
  thumbnailUrl: string | null;
}
