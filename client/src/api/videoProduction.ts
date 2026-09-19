import { API_V1 } from './config';
import { fetchJson, withSignal, type FetchOptions } from './http';
import type {
  ProductionCharactersResponse,
  ProductionMetadataResponse,
  ProductionScenesResponse,
  ProductionTranscriptResponse,
  ProductionVideoListItem,
} from '../types/videoProductionScenes';

interface ProductionVideosResponse {
  items: ProductionVideoListItem[];
}

export function fetchProductionVideos(options?: FetchOptions) {
  return fetchJson<ProductionVideosResponse>(
    `${API_V1}/video-production/videos`,
    withSignal(undefined, options),
  ).then((data) => data.items);
}

export function fetchProductionScenes(
  channelId: string,
  videoId: string,
  options?: FetchOptions,
) {
  return fetchJson<ProductionScenesResponse>(
    `${API_V1}/video-production/videos/${encodeURIComponent(channelId)}/${encodeURIComponent(videoId)}/scenes`,
    withSignal(undefined, options),
  );
}

export function regenerateProductionSceneImage(
  channelId: string,
  videoId: string,
  sceneIndex: number,
  options?: FetchOptions,
) {
  return fetchJson<ProductionScenesResponse>(
    `${API_V1}/video-production/videos/${encodeURIComponent(channelId)}/${encodeURIComponent(videoId)}/scenes/${sceneIndex}/regenerate`,
    withSignal({ method: 'POST' }, options),
  );
}

export function fetchProductionTranscript(
  channelId: string,
  videoId: string,
  options?: FetchOptions,
) {
  return fetchJson<ProductionTranscriptResponse>(
    `${API_V1}/video-production/videos/${encodeURIComponent(channelId)}/${encodeURIComponent(videoId)}/transcript`,
    withSignal(undefined, options),
  );
}

export function fetchProductionCharacters(
  channelId: string,
  videoId: string,
  options?: FetchOptions,
) {
  return fetchJson<ProductionCharactersResponse>(
    `${API_V1}/video-production/videos/${encodeURIComponent(channelId)}/${encodeURIComponent(videoId)}/characters`,
    withSignal(undefined, options),
  );
}

export function fetchProductionMetadata(
  channelId: string,
  videoId: string,
  options?: FetchOptions,
) {
  return fetchJson<ProductionMetadataResponse>(
    `${API_V1}/video-production/videos/${encodeURIComponent(channelId)}/${encodeURIComponent(videoId)}/metadata`,
    withSignal(undefined, options),
  );
}

export function productionSceneImageUrl(
  channelId: string,
  videoId: string,
  sceneIndex: number,
): string {
  return `${API_V1}/video-production/videos/${encodeURIComponent(channelId)}/${encodeURIComponent(videoId)}/scenes/${sceneIndex}/image`;
}

export function productionCharacterImageUrl(
  channelId: string,
  videoId: string,
  characterId: string,
): string {
  return `${API_V1}/video-production/videos/${encodeURIComponent(channelId)}/${encodeURIComponent(videoId)}/characters/${encodeURIComponent(characterId)}/image`;
}
