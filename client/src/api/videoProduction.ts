import { API_V1 } from './config';
import type { RemakeJob, RemakeProvider } from './scriptRemake';
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

/** Creates the folder of a Preparing video that only has a skill script yet, so the production tabs work. */
export function startPreparingProductionVideo(channelId: string, videoId: string) {
  return fetchJson<{ created: boolean }>(
    `${API_V1}/video-production/videos/${encodeURIComponent(channelId)}/${encodeURIComponent(videoId)}/start-preparing`,
    { method: 'POST' },
  );
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

export function updateProductionScene(
  channelId: string,
  videoId: string,
  sceneIndex: number,
  patch: { prompt?: string; references?: string[] },
  options?: FetchOptions,
) {
  return fetchJson<ProductionScenesResponse>(
    `${API_V1}/video-production/videos/${encodeURIComponent(channelId)}/${encodeURIComponent(videoId)}/scenes/${sceneIndex}`,
    withSignal(
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      },
      options,
    ),
  );
}

export function replaceProductionSceneImage(
  channelId: string,
  videoId: string,
  sceneIndex: number,
  file: File,
  options?: FetchOptions,
) {
  const body = new FormData();
  body.append('file', file);
  return fetchJson<ProductionScenesResponse>(
    `${API_V1}/video-production/videos/${encodeURIComponent(channelId)}/${encodeURIComponent(videoId)}/scenes/${sceneIndex}/image`,
    withSignal({ method: 'PUT', body }, options),
  );
}

export function regenerateMissingProductionSceneImages(
  channelId: string,
  videoId: string,
  options?: FetchOptions,
) {
  return fetchJson<ProductionScenesResponse>(
    `${API_V1}/video-production/videos/${encodeURIComponent(channelId)}/${encodeURIComponent(videoId)}/scenes/regenerate-missing`,
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

export function productionOutputVideoUrl(channelId: string, videoId: string): string {
  return `${API_V1}/video-production/videos/${encodeURIComponent(channelId)}/${encodeURIComponent(videoId)}/video`;
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

export function addProductionCharacter(
  channelId: string,
  videoId: string,
  payload: { name: string; description?: string; prompt?: string },
) {
  return fetchJson<ProductionCharactersResponse>(
    `${API_V1}/video-production/videos/${encodeURIComponent(channelId)}/${encodeURIComponent(videoId)}/characters`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
}

export function uploadProductionCharacterImage(
  channelId: string,
  videoId: string,
  characterId: string,
  image: File,
) {
  const form = new FormData();
  form.append('image', image);
  return fetchJson<ProductionCharactersResponse>(
    `${API_V1}/video-production/videos/${encodeURIComponent(channelId)}/${encodeURIComponent(videoId)}/characters/${encodeURIComponent(characterId)}/image`,
    { method: 'POST', body: form },
  );
}

function videoBase(channelId: string, videoId: string): string {
  return `${API_V1}/video-production/videos/${encodeURIComponent(channelId)}/${encodeURIComponent(videoId)}`;
}

/** Source audio of the video, or the VOICEVOX narration once a remake channel replaced it. */
export function productionAudioUrl(channelId: string, videoId: string, version = ''): string {
  return `${videoBase(channelId, videoId)}/audio${version ? `?v=${encodeURIComponent(version)}` : ''}`;
}

export interface ChannelVideoVoice {
  speaker: number;
  /** ×speed on top of the saved voice's own speed when `presetId` is set; otherwise the bare speaker's ×speed. */
  speedScale: number;
  /** Saved VOICEVOX voice (Settings → VOICEVOX) the narration was read with. */
  presetId?: string;
  durationSec: number;
  at: string;
}

export interface ChannelVideoScript {
  text: string;
  chars: number;
  remakeJobId?: string;
  /** Set when script.txt came from the nightly skill run instead of an LLM remake job. */
  skillScript?: { checkedAt: string; topicKey: string };
  voice?: ChannelVideoVoice;
  voiceJob?: { status: 'running' | 'done' | 'failed'; progress?: string; error?: string; notice?: string };
  sourceReplaced: boolean;
  /** Numbers, names and Latin words of the last narration, and how the voice read them. */
  readingChecks?: ChannelVideoReadingCheck[];
  /** Scenes were made for a script that has since changed a lot (share of sentences kept). */
  scenesStale?: { matchedPercent: number };
}

export interface ChannelVideoReadingCheck {
  term: string;
  kind: 'number' | 'name' | 'latin' | 'homograph';
  count: number;
  sentence: string;
  /** Katakana VOICEVOX read for that sentence. */
  reading?: string;
}

export function fetchChannelVideoScript(channelId: string, videoId: string, options?: FetchOptions) {
  return fetchJson<ChannelVideoScript>(`${videoBase(channelId, videoId)}/script`, withSignal(undefined, options));
}

function sendJson<T>(url: string, method: 'POST' | 'PUT', body: unknown) {
  return fetchJson<T>(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

export function saveChannelVideoScript(channelId: string, videoId: string, text: string) {
  return sendJson<ChannelVideoScript>(`${videoBase(channelId, videoId)}/script`, 'PUT', { text });
}

export function startChannelVideoRemake(
  channelId: string,
  videoId: string,
  body: { provider?: RemakeProvider; promptSetId?: string; notes?: string },
) {
  return sendJson<RemakeJob>(`${videoBase(channelId, videoId)}/script/remake`, 'POST', body);
}

export function importChannelVideoRemake(channelId: string, videoId: string, jobId?: string) {
  return sendJson<ChannelVideoScript>(`${videoBase(channelId, videoId)}/script/import-remake`, 'POST', { jobId });
}

/** With `presetId` the saved voice reads (its speaker, pitch, intonation…) and `speedScale` multiplies its speed. */
export function startChannelVideoVoice(
  channelId: string,
  videoId: string,
  body: { speaker: number; speedScale: number; presetId?: string },
) {
  return sendJson<ChannelVideoScript>(`${videoBase(channelId, videoId)}/voice`, 'POST', body);
}

/** Ảnh → video for a channel video: scene list with clip status, plus the background job. */
export interface ChannelVideoMotionState {
  motionDefault: 'intro' | 'full' | 'interleaved' | 'scenes' | 'none';
  scenes: import('./manualVideo').ManualSceneItem[];
  job: { status: 'running' | 'done' | 'failed'; message?: string; error?: string } | null;
}

function productionVideoBase(channelId: string, videoId: string): string {
  return `${API_V1}/video-production/videos/${encodeURIComponent(channelId)}/${encodeURIComponent(videoId)}`;
}

export function fetchChannelVideoMotion(channelId: string, videoId: string, options?: FetchOptions) {
  return fetchJson<ChannelVideoMotionState>(`${productionVideoBase(channelId, videoId)}/motion`, withSignal(undefined, options));
}

export function generateChannelVideoClips(
  channelId: string,
  videoId: string,
  mode: 'intro' | 'full' | 'interleaved' | 'scenes',
  indexes?: number[],
  provider?: 'flow' | 'muse',
) {
  return fetchJson<ChannelVideoMotionState>(`${productionVideoBase(channelId, videoId)}/motion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, indexes, provider }),
  });
}

export function removeChannelVideoClip(channelId: string, videoId: string, index: number) {
  return fetchJson<ChannelVideoMotionState>(`${productionVideoBase(channelId, videoId)}/motion/${index}`, { method: 'DELETE' });
}

/** Replaces one scene's clip with a chosen mp4 file. */
export function replaceChannelVideoClip(channelId: string, videoId: string, index: number, clip: File) {
  const form = new FormData();
  form.append('file', clip);
  return fetchJson<ChannelVideoMotionState>(`${productionVideoBase(channelId, videoId)}/motion/${index}/clip`, {
    method: 'PUT',
    body: form,
  });
}

export function channelVideoSceneClipUrl(
  channelId: string,
  videoId: string,
  scene: { index: number; clipVersion: number },
): string {
  return `${productionVideoBase(channelId, videoId)}/scenes/${scene.index}/clip?v=${scene.clipVersion}`;
}

export function channelVideoSceneImageUrl(
  channelId: string,
  videoId: string,
  scene: { index: number; imageVersion: number },
): string {
  return `${productionVideoBase(channelId, videoId)}/scenes/${scene.index}/image?v=${scene.imageVersion}`;
}
