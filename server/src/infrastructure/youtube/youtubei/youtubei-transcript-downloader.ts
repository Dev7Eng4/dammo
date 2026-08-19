import fs from 'node:fs/promises';
import path from 'node:path';
import type { Innertube } from 'youtubei.js';
import { AppError } from '../../../shared/http/errors.js';
import { requireYoutubeVideoId } from '../youtube-url.js';
import type { TranscriptLanguage } from '../youtube-transcript-downloader.js';
import { getYoutubeiClient, toYoutubeiError } from './youtubei-client.js';

const LANGUAGE_NAMES: Record<TranscriptLanguage, string[]> = {
  en: ['english'],
  ja: ['japanese', '日本語'],
  ko: ['korean', '한국어'],
  es: ['spanish', 'español', 'espanol'],
};

function msToVttTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function escapeVtt(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isLanguageMatch(code: string, language: TranscriptLanguage): boolean {
  const normalized = code.trim().toLowerCase().replaceAll('_', '-');
  return normalized === language || normalized.startsWith(`${language}-`);
}

function pickCaptionTrack(
  tracks: Array<{ language_code: string; kind?: string; base_url: string }> | undefined,
  language: TranscriptLanguage,
): { language_code: string; kind?: string; base_url: string } | null {
  if (!tracks?.length) return null;
  const matches = tracks.filter(track => isLanguageMatch(track.language_code, language));
  if (!matches.length) return null;
  return matches.find(track => track.kind !== 'asr') ?? matches[0] ?? null;
}

async function downloadCaptionTrackVtt(
  yt: Innertube,
  baseUrl: string,
): Promise<string | null> {
  const url = new URL(baseUrl);
  url.searchParams.set('fmt', 'vtt');

  const response = await yt.session.http.fetch(url.toString());
  if (!response.ok) return null;

  const text = (await response.text()).trim();
  if (!text || !text.toUpperCase().includes('WEBVTT')) return null;
  return text;
}

function segmentsToVtt(segments: readonly unknown[]): string | null {
  const cues: string[] = [];

  for (const segment of segments) {
    if (!segment || typeof segment !== 'object') continue;
    const item = segment as { start_ms?: string; end_ms?: string; snippet?: { text?: string } };
    const text = item.snippet?.text?.trim();
    if (!text) continue;

    const startMs = Number(item.start_ms);
    const endMs = Number(item.end_ms);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;

    cues.push(`${msToVttTime(startMs)} --> ${msToVttTime(endMs)}\n${escapeVtt(text)}`);
  }

  if (!cues.length) return null;
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

async function downloadViaCaptionTracks(
  yt: Innertube,
  videoId: string,
  language: TranscriptLanguage,
): Promise<string | null> {
  const info = await yt.getInfo(videoId, { client: 'ANDROID' });
  const track = pickCaptionTrack(info.captions?.caption_tracks, language);
  if (!track) return null;
  return downloadCaptionTrackVtt(yt, track.base_url);
}

async function downloadViaTranscriptApi(
  yt: Innertube,
  videoId: string,
  language: TranscriptLanguage,
): Promise<string | null> {
  const info = await yt.getInfo(videoId);
  const transcriptInfo = await info.getTranscript();
  let selected = transcriptInfo;

  const targetNames = LANGUAGE_NAMES[language];
  const match = selected.languages.find(name => {
    const lower = name.toLowerCase();
    return targetNames.some(target => lower.includes(target)) || isLanguageMatch(name, language);
  });

  if (match && match !== selected.selectedLanguage) {
    selected = await selected.selectLanguage(match);
  }

  const segments = selected.transcript.content?.body?.initial_segments ?? [];
  return segmentsToVtt(segments);
}

export async function downloadYoutubeTranscriptWithYoutubei(
  url: string,
  outputDir: string,
  language: TranscriptLanguage,
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });
  const videoId = requireYoutubeVideoId(url);

  try {
    const yt = await getYoutubeiClient();
    let vtt: string | null = null;
    try {
      vtt = await downloadViaCaptionTracks(yt, videoId, language);
    } catch {
      vtt = null;
    }
    if (!vtt) {
      try {
        vtt = await downloadViaTranscriptApi(yt, videoId, language);
      } catch {
        vtt = null;
      }
    }

    if (!vtt) {
      throw new AppError(
        `Transcript not found for language "${language}"`,
        404,
        'TRANSCRIPT_NOT_FOUND',
      );
    }

    const canonicalPath = path.join(outputDir, `transcript.${language}.vtt`);
    await fs.writeFile(canonicalPath, vtt, 'utf8');
    return canonicalPath;
  } catch (err) {
    throw toYoutubeiError(err, 'Failed to download YouTube transcript');
  }
}
