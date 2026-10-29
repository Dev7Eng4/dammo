import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { AppError } from '../../shared/http/errors.js';
import { resolveFfmpegLocation } from '../ffmpeg/ffmpeg-location.js';
import { assertMediaFileComplete } from '../ffmpeg/ffmpeg-probe.js';
import type { TranscriptLanguage } from '../youtube/youtube-transcript-downloader.js';
import { resolveFacebookReelMedia, type FacebookCaptionTrack } from './facebook-reel-resolver.js';

const FETCH_TIMEOUT_MS = 120_000;
const MIN_VIDEO_BYTES = 10 * 1024;

async function fetchToFile(url: string, targetPath: string): Promise<void> {
  const response = await fetch(url, {
    headers: { referer: 'https://www.facebook.com/' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok || !response.body) {
    throw new AppError(`Facebook CDN request failed (${response.status})`, 502, 'FACEBOOK_DOWNLOAD_FAILED');
  }
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(targetPath));
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { referer: 'https://www.facebook.com/' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new AppError(`Facebook CDN request failed (${response.status})`, 502, 'FACEBOOK_DOWNLOAD_FAILED');
  }
  return response.text();
}

export interface DownloadFacebookVideoOptions {
  outputBasename?: string;
}

export async function downloadFacebookVideo(
  url: string,
  outputDir: string,
  options?: DownloadFacebookVideoOptions,
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });
  const media = await resolveFacebookReelMedia(url);
  const outPath = path.join(outputDir, `${options?.outputBasename ?? 'video'}.mp4`);

  try {
    await fetchToFile(media.videoUrl, outPath);
    const { size } = await fs.stat(outPath);
    if (size < MIN_VIDEO_BYTES) {
      throw new AppError('Downloaded Facebook video is empty', 502, 'FACEBOOK_DOWNLOAD_FAILED');
    }
    await assertMediaFileComplete(outPath, { label: path.basename(outPath) });
  } catch (err) {
    await fs.unlink(outPath).catch(() => undefined);
    throw err;
  }
  return outPath;
}

function extractAudio(ffmpegDir: string, inputPath: string, outputPath: string): Promise<void> {
  const binary = path.join(ffmpegDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ['-y', '-i', inputPath, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', outputPath], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-2000);
    });
    child.on('error', (err) => reject(new AppError(`ffmpeg failed to start: ${err.message}`, 500, 'FFMPEG_NOT_FOUND')));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new AppError(`ffmpeg audio extraction failed: ${stderr.trim()}`, 502, 'FACEBOOK_DOWNLOAD_FAILED'));
    });
  });
}

/** Facebook serves audio only inside the mp4, so the audio is extracted to mp3 with ffmpeg. */
export async function downloadFacebookAudio(url: string, outputDir: string): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });
  const tempVideo = await downloadFacebookVideo(url, outputDir, { outputBasename: 'audio-source' });
  const audioPath = path.join(outputDir, 'audio.mp3');

  try {
    await extractAudio(resolveFfmpegLocation(), tempVideo, audioPath);
    await assertMediaFileComplete(audioPath, { label: 'audio.mp3' });
  } catch (err) {
    await fs.unlink(audioPath).catch(() => undefined);
    throw err;
  } finally {
    await fs.unlink(tempVideo).catch(() => undefined);
  }
  return audioPath;
}

const SRT_START = new RegExp(String.raw`^\d+\s*\r?\n\d{1,2}:\d{2}:\d{2}[,.]\d{3} -->`);

function detectSubtitleExtension(body: string): 'srt' | 'vtt' | null {
  const head = body.replace(/^﻿/, '').trimStart();
  if (head.startsWith('WEBVTT')) return 'vtt';
  return SRT_START.test(head) ? 'srt' : null;
}

function pickCaption(
  captions: FacebookCaptionTrack[],
  language: TranscriptLanguage,
): { track: FacebookCaptionTrack; language: string } | null {
  const byLanguage = (track: FacebookCaptionTrack) => track.locale.toLowerCase().split('_')[0] ?? '';
  const exact = captions.find((track) => byLanguage(track) === language);
  if (exact) return { track: exact, language };

  const fallback = captions[0];
  return fallback ? { track: fallback, language: byLanguage(fallback) || language } : null;
}

/**
 * Downloads Facebook's caption track (served as SRT; WebVTT is accepted too). Prefers the requested language and falls back to the
 * first available track; the file name carries the language actually delivered.
 */
export async function downloadFacebookTranscript(
  url: string,
  outputDir: string,
  language: TranscriptLanguage,
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });
  const media = await resolveFacebookReelMedia(url);
  const picked = pickCaption(media.captions, language);
  if (!picked) {
    throw new AppError(`Transcript not found for this Facebook reel`, 404, 'TRANSCRIPT_NOT_FOUND');
  }

  const body = await fetchText(picked.track.url);
  const extension = detectSubtitleExtension(body);
  if (!extension) {
    throw new AppError('Facebook caption file is neither SRT nor WebVTT', 502, 'FACEBOOK_DOWNLOAD_FAILED');
  }

  const outPath = path.join(outputDir, `transcript.${picked.language}.${extension}`);
  await fs.writeFile(outPath, body, 'utf8');
  return outPath;
}

export interface DownloadFacebookThumbnailOptions {
  outputBasename?: string;
}

export async function downloadFacebookThumbnail(
  url: string,
  outputDir: string,
  options?: DownloadFacebookThumbnailOptions,
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });
  const media = await resolveFacebookReelMedia(url);
  if (!media.thumbnailUrl) {
    throw new AppError('Facebook reel has no thumbnail', 404, 'FACEBOOK_DOWNLOAD_FAILED');
  }

  const outPath = path.join(outputDir, `${options?.outputBasename?.trim() || 'old-thumbnail'}.jpg`);
  await fetchToFile(media.thumbnailUrl, outPath);
  return outPath;
}
