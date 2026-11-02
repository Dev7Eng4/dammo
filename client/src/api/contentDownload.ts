import { API_V1 } from './config';
import { fetchJson, withSignal, type FetchOptions } from './http';

export type DownloadPlatform = 'youtube' | 'facebook';
export type TranscriptLanguage = 'en' | 'ko' | 'ja' | 'es';

export interface DownloadArtifact {
  platform: DownloadPlatform;
  videoId: string;
  assetType: string;
  language: TranscriptLanguage | null;
  path: string;
  relativePath: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export function downloadTranscript(
  platform: DownloadPlatform,
  url: string,
  language: TranscriptLanguage,
  options?: FetchOptions,
) {
  return fetchJson<{ item: DownloadArtifact }>(
    `${API_V1}/content-download/${platform}/transcript`,
    withSignal(
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, language }),
      },
      options,
    ),
  );
}

export function fetchTextArtifact(relativePath: string, options?: FetchOptions) {
  return fetchJson<{ content: string }>(
    `${API_V1}/content-download/text?relativePath=${encodeURIComponent(relativePath)}`,
    withSignal(undefined, options),
  );
}
