/**
 * Shared by the per-video skill CLIs (scene-cli, motion-cli): find a channel video folder from an id or
 * path, read its subtitles and timing, and talk to the running server.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { env } from '../../config/env.js';
import { youtubeChannelDir } from '../../config/paths.js';
import { srtTimestampToMs } from '../../infrastructure/subtitle/srt-utils.js';
import { AI_SCENE_PROMPTS_FILENAME } from '../../modules/video-production/shared/ai-video/ai-video.constants.js';
import type { TranscriptCue } from '../../modules/video-production/shared/ai-video/ai-video.types.js';
import { videoPrepareRepository } from '../../modules/youtube-channels/video-prepare.repository.js';
import { youtubeChannelsRepository } from '../../modules/youtube-channels/youtube-channels.repository.js';
import type { YoutubeChannel } from '../../modules/youtube-channels/youtube-channels.types.js';

// ---------- small helpers ----------
export const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};
export const readJson = (file: string): any => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
};
export const writeJson = (file: string, data: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
};
export const r1 = (n: number) => Math.round(n * 10) / 10;
export const clock = (sec: number) => `${Math.floor(sec / 60)}:${(sec % 60).toFixed(1).padStart(4, '0')}`;
export const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// ---------- locate ----------
export const SUBTITLE_FILES = ['transcript-updated.srt', 'transcript.srt'];
/** Video states the server makes images / clips for. */
export const PRODUCTION = new Set(['Preparing', 'Prepared', 'Created']);

export interface VideoRef {
  channel: YoutubeChannel;
  videoId: string;
  dir: string;
  status: string;
  title: string;
}

function channelVideoDirs(channelId: string): string[] {
  const base = youtubeChannelDir(channelId);
  return [path.join(base, 'videos'), base];
}

function videoRef(channel: YoutubeChannel, videoId: string): VideoRef | null {
  const item = videoPrepareRepository.read(channel.id).find(entry => entry.videoId.trim() === videoId);
  const dir = channelVideoDirs(channel.id)
    .map(base => path.join(base, videoId))
    .find(candidate => ['video-meta.json', AI_SCENE_PROMPTS_FILENAME, ...SUBTITLE_FILES].some(name => fs.existsSync(path.join(candidate, name))));
  if (!dir) return null;
  return { channel, videoId, dir, status: item?.status ?? 'unknown', title: item?.title ?? readJson(path.join(dir, 'video-meta.json'))?.metadata?.title ?? '' };
}

export function resolveVideo(input: string | undefined): VideoRef {
  if (!input) return fail('Thiếu video (id hoặc đường dẫn thư mục).');
  const cleaned = input.replace(/[\\/]+$/, '');
  const videoId = path.basename(cleaned);
  const channels = youtubeChannelsRepository.findAll();
  const fromPath = /[\\/]/.test(cleaned) ? channels.find(channel => cleaned.replaceAll('\\', '/').includes(`/${channel.id}/`)) : undefined;
  for (const channel of fromPath ? [fromPath] : channels) {
    const ref = videoRef(channel, videoId);
    if (ref) return ref;
  }
  return fail(`Không thấy video: ${input}`);
}

/** A channel id → its production videos; a video id/path → that video; nothing → every channel. */
export function resolveScope(input: string | undefined): VideoRef[] {
  const channels = youtubeChannelsRepository.findAll();
  if (input) {
    const id = path.basename(input.replace(/[\\/]+$/, ''));
    const channel = channels.find(entry => entry.id === id);
    if (!channel) return [resolveVideo(input)];
    return productionVideos(channel);
  }
  return channels.flatMap(productionVideos);
}

function productionVideos(channel: YoutubeChannel): VideoRef[] {
  return videoPrepareRepository
    .read(channel.id)
    .filter(item => PRODUCTION.has(item.status))
    .map(item => videoRef(channel, item.videoId.trim()))
    .filter((ref): ref is VideoRef => ref !== null);
}

export function subtitlePath(dir: string): string | null {
  const name = SUBTITLE_FILES.find(file => fs.existsSync(path.join(dir, file)));
  return name ? path.join(dir, name) : null;
}

/** Same rule as the scene checker: remake videos play at speed 1, others at the locked render speed. */
export function audioSpeed(ref: VideoRef): number {
  if (ref.channel.type === 'remake_video') return 1;
  const speed = Number(readJson(path.join(ref.dir, 'ai-render-config.json'))?.audioSpeed);
  return Number.isFinite(speed) && speed > 0 ? speed : 1;
}

// ---------- timing ----------
export interface Timed {
  startSec: number;
  shownSec: number;
}

/** On-screen time of each scene: the app holds an image from its start until the next scene starts. */
export function onScreen(scenes: Array<{ startTime: string; endTime: string }>, speed: number): Timed[] {
  return scenes.map((scene, index) => {
    const start = srtTimestampToMs(scene.startTime) / 1000;
    const next = index + 1 < scenes.length ? srtTimestampToMs(scenes[index + 1]!.startTime) / 1000 : srtTimestampToMs(scene.endTime) / 1000;
    return { startSec: start / speed, shownSec: Math.max(0, next - start) / speed };
  });
}

// ---------- chapters (from script.txt when the video has one) ----------
const norm = (text: string) => text.replace(/[\s、。，．・「」『』（）()！？!?…ー―-]/g, '');

/** Cue index → chapter heading, matched from the `## heading` lines of script.txt. */
export function chapterStarts(dir: string, cues: TranscriptCue[]): Map<number, string> {
  const result = new Map<number, string>();
  const script = ['script.txt', 'script-updated.txt'].map(name => path.join(dir, name)).find(file => fs.existsSync(file));
  if (!script) return result;
  const lines = fs.readFileSync(script, 'utf8').split(/\r?\n/);
  let from = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const heading = /^##\s*(.+)$/.exec(lines[i]!.trim());
    if (!heading) continue;
    const first = lines.slice(i + 1).find(line => line.trim() && !line.startsWith('#'));
    if (!first) continue;
    const probe = norm(first).slice(0, 10);
    if (probe.length < 4) continue;
    const at = cues.findIndex((cue, index) => index >= from && norm(cues.slice(index, index + 3).map(c => c.text).join('')).includes(probe));
    if (at === -1) continue;
    result.set(at, heading[1]!.trim());
    from = at + 1;
  }
  return result;
}

// ---------- server ----------
/** node:http, not fetch: long server jobs (drawing 100+ images) outlast fetch's 5-minute header timeout. */
export function serverRequest(method: string, url: string, body: unknown = {}): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const request = http.request(`http://localhost:${env.port}/api/v1${url}`, { method, headers: { 'content-type': 'application/json' } }, response => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', chunk => (raw += chunk));
      response.on('end', () => {
        let parsed: any = raw;
        try {
          parsed = JSON.parse(raw);
        } catch {
          // keep raw text
        }
        resolve({ status: response.statusCode ?? 0, body: parsed });
      });
    });
    request.on('error', reject);
    request.end(method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body));
  });
}

export async function serverUp(): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${env.port}/api/v1/task-queue?view=summary`, { signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch {
    return false;
  }
}
