import fs from 'node:fs';
import path from 'node:path';
import { paths } from '../../config/paths.js';
import { videoAgentRepository, videoAgentRunDir } from '../video-agent/video-agent.repository.js';
import type { VideoAgentRun } from '../video-agent/video-agent.types.js';

/** `download`: a transcript fetched on its own (older screen), not part of any project. */
export type LibraryKind = 'agent' | 'manual' | 'download';
export type LibraryPhase = 'finished' | 'in_progress' | 'download';
export type LibraryFileKind = 'transcript' | 'script' | 'remake' | 'audio' | 'subtitle' | 'video';

export interface LibraryFile {
  kind: LibraryFileKind;
  path: string;
  sizeBytes: number;
}

export interface ManualLibraryItem {
  key: string;
  kind: LibraryKind;
  phase: LibraryPhase;
  runId?: string;
  videoId?: string;
  title: string;
  channelName?: string;
  createdAt: string;
  updatedAt: string;
  /** Pipeline stages reached: source, script, approval, voice, scenes, video. */
  stagesDone: string[];
  chars?: number;
  minutes?: number;
  durationSec?: number | null;
  folder: string;
  videoPath?: string;
  sizeBytes?: number;
  files: LibraryFile[];
}

function fileInfo(kind: LibraryFileKind, filePath: string | undefined): LibraryFile | null {
  if (!filePath) return null;
  const stat = fs.statSync(filePath, { throwIfNoEntry: false });
  return stat?.isFile() ? { kind, path: filePath, sizeBytes: stat.size } : null;
}

function present(files: Array<LibraryFile | null>): LibraryFile[] {
  return files.filter((file): file is LibraryFile => file !== null);
}

function listDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** Newest file in `dir` whose name matches, by modification time. */
function newestMatching(dir: string, pattern: RegExp): string | undefined {
  return listDir(dir)
    .filter(name => pattern.test(name))
    .map(name => path.join(dir, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

function runItem(run: VideoAgentRun): ManualLibraryItem {
  const dir = videoAgentRunDir(run.id);
  const video = fileInfo('video', run.artifacts.videoPath);
  const files = present([
    ...run.artifacts.sources.map(source => fileInfo('transcript', source.transcriptPath)),
    fileInfo('script', path.join(dir, 'script.txt')),
    fileInfo('remake', newestMatching(path.join(dir, 'remake'), /\.txt$/)),
    fileInfo('audio', run.artifacts.audioPath),
    fileInfo('subtitle', run.artifacts.subtitlePath),
    video,
  ]);
  return {
    key: `run:${run.id}`,
    kind: run.mode ?? 'agent',
    phase: video ? 'finished' : 'in_progress',
    runId: run.id,
    title: run.title ?? run.artifacts.sources[0]?.title ?? run.id.slice(0, 8),
    channelName: run.channelName,
    createdAt: run.createdAt,
    updatedAt: video ? new Date(fs.statSync(video.path).mtimeMs).toISOString() : run.updatedAt,
    stagesDone: run.stagesDone,
    chars: run.script?.totalChars,
    minutes: run.script?.estimatedMinutes,
    durationSec: run.artifacts.audioDurationSec ?? null,
    folder: dir,
    videoPath: video?.path,
    sizeBytes: video?.sizeBytes,
    files,
  };
}

interface RemakeFile {
  outline?: { title?: string };
  totalChars?: number;
  estimatedMinutes?: number;
}

/**
 * Transcripts fetched on their own (and any remake of them) live in `media-downloads/youtube/<videoId>`.
 * They belong to no project, so without this scan they would be invisible in the library.
 */
function downloadItems(): ManualLibraryItem[] {
  const root = path.join(paths.mediaDownloadsDir, 'youtube');
  const items: ManualLibraryItem[] = [];
  for (const videoId of listDir(root)) {
    const dir = path.join(root, videoId);
    if (!fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) continue;

    const names = listDir(dir);
    const transcript = names.find(name => /^transcript\.[a-z]+\.(vtt|srt|txt)$/i.test(name));
    const remakeDir = path.join(dir, 'remake');
    const remakeJson = newestMatching(remakeDir, /\.json$/);
    if (!transcript && !remakeJson) continue; // leftovers of other tools, not a transcript download

    const remake = remakeJson ? readJsonFile<RemakeFile>(remakeJson) : null;
    const meta = readJsonFile<{ metadata?: { title?: string } }>(path.join(dir, 'video-meta.json'));
    const files = present([
      ...names.filter(name => /^transcript\..+\.(vtt|srt|txt)$/i.test(name)).map(name => fileInfo('transcript', path.join(dir, name))),
      fileInfo('remake', newestMatching(remakeDir, /\.txt$/)),
      fileInfo('audio', path.join(dir, 'audio.mp3')),
    ]);
    const times = files.map(file => fs.statSync(file.path).mtimeMs);
    items.push({
      key: `download:${videoId}`,
      kind: 'download',
      phase: 'download',
      videoId,
      title: remake?.outline?.title ?? meta?.metadata?.title ?? videoId,
      createdAt: new Date(Math.min(...times)).toISOString(),
      updatedAt: new Date(Math.max(...times)).toISOString(),
      stagesDone: remakeJson ? ['source', 'script'] : ['source'],
      chars: remake?.totalChars,
      minutes: remake?.estimatedMinutes,
      folder: dir,
      files,
    });
  }
  return items;
}

/** Every project (agent and step-by-step) at any stage, plus standalone transcript downloads. */
export function buildLibrary(): ManualLibraryItem[] {
  return [...videoAgentRepository.findAll().map(runItem), ...downloadItems()].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function downloadsRoot(): string {
  return path.resolve(paths.mediaDownloadsDir, 'youtube');
}
