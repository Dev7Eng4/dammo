import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TranscriptLanguage } from '../../infrastructure/youtube/youtube-transcript-downloader.js';
import { DEFAULT_TRANSCRIPT_LANGUAGE } from '../../infrastructure/youtube/youtube-transcript-downloader.js';

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const INPUT_FILE = path.join(SERVER_ROOT, 'input.txt');

const SUPPORTED_LANGUAGES = new Set<TranscriptLanguage>(['en', 'ko', 'ja', 'es']);

function parseLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  return trimmed;
}

export interface InputFileContent {
  url: string;
  language: TranscriptLanguage;
  transcriptEngine: TranscriptEngine;
}

export type TranscriptEngine = 'auto' | 'ytdlp' | 'youtubei' | 'youtube-transcript';
const SUPPORTED_ENGINES = new Set<TranscriptEngine>(['auto', 'ytdlp', 'youtubei', 'youtube-transcript']);

export async function readInput(): Promise<InputFileContent> {
  let raw: string;
  try {
    raw = await fs.readFile(INPUT_FILE, 'utf8');
  } catch {
    throw new Error(`Không đọc được ${INPUT_FILE}. Hãy tạo file và nhập link YouTube.`);
  }

  const lines = raw.split(/\r?\n/).map(parseLine).filter((line): line is string => Boolean(line));

  const url = lines[0];
  if (!url) {
    throw new Error(`Chưa có URL trong ${INPUT_FILE}. Hãy dán link YouTube vào dòng đầu tiên.`);
  }

  const languageCandidate = lines[1]?.toLowerCase();
  const language =
    languageCandidate && SUPPORTED_LANGUAGES.has(languageCandidate as TranscriptLanguage)
      ? (languageCandidate as TranscriptLanguage)
      : DEFAULT_TRANSCRIPT_LANGUAGE;

  const engineCandidate = lines[2]?.toLowerCase();
  const transcriptEngine =
    engineCandidate && SUPPORTED_ENGINES.has(engineCandidate as TranscriptEngine)
      ? (engineCandidate as TranscriptEngine)
      : 'auto';

  return { url, language, transcriptEngine };
}

export function printResult(label: string, filePath: string, sizeBytes: number): void {
  console.log(`${label}: ${filePath}`);
  console.log(`Size: ${sizeBytes} bytes`);
}
