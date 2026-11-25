/**
 * `Preparing`: a remake video started from a skill script, finished in the production tabs (voice, scenes,
 * title, thumbnail); it becomes `Prepared` once all of those exist. A skill script not opened yet is listed as
 * `Preparing` with `videoFolderPath: null`: opening it creates the folder first (startPreparingProductionVideo).
 */
export type ProductionVideoStatus = 'Preparing' | 'Prepared' | 'Created';

export interface ProductionVideoListItem {
  channelId: string;
  channelName: string;
  /** Remake channels remake the script and read it with VOICEVOX; others keep the source audio. */
  channelType: string;
  videoId: string;
  title: string;
  status: ProductionVideoStatus;
  sceneCount: number;
  hasScenes: boolean;
  thumbnailUrl: string | null;
  videoFolderPath: string | null;
  /** Skill script not opened yet (no folder): its estimated length. */
  estimatedMinutes?: number;
}

export interface ProductionSceneItem {
  index: number;
  prompt: string;
  startTime: string;
  endTime: string;
  durationSec: number;
  imageUrl: string | null;
  references?: string[];
  /** `title`: chapter heading rendered as a text card (no AI prompt). */
  type?: 'title';
  title?: string;
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
  /** The channel mascot (channel-level image, not part of this video's generated cast). */
  isMascot?: boolean;
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

/** Detail tabs in processing order, like a project's steps. */
export type ProductionDetailTab = 'source' | 'script' | 'voice' | 'characters' | 'scenes' | 'motion' | 'video' | 'metadata';

export function productionVideoKey(video: Pick<ProductionVideoListItem, 'channelId' | 'videoId'>): string {
  return `${video.channelId}:${video.videoId}`;
}
