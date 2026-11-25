import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { youtubeChannelDir } from '../../config/paths.js';

/**
 * Scripts written ahead by the `jp-psy-script-remake` skill (nightly `remake auto` run) for the source
 * videos a remake channel will prepare next. When "Chuẩn bị video" reaches a source that has one here
 * and it passed `script check --save`, the app narrates it instead of remaking with ChatGPT/Gemini.
 *
 *   data/youtube-channels/<channelId>/remake-ready/<sourceVideoId>/
 *     script.txt    "# title", "## 1. heading", one sentence per line
 *     research.md   why this angle, verified studies with URLs, outline
 *     meta.json     ReadyScriptMeta
 *     check.json    ReadyScriptCheck, written by `npm run script -- check … --save`
 */

export const REMAKE_READY_DIR = 'remake-ready';

export interface ReadyScriptMeta {
  title?: string;
  /** The new angle in one sentence; the metadata step builds the title and description on it. */
  angle?: string;
  /** What the first 30 seconds say. */
  hook?: string;
  /** The named person whose story runs through the video (as the app's remake outline has it). */
  story?: string;
  /** Why this length (Vietnamese), as the app's remake outline has it. */
  lengthReason?: string;
  cluster?: string;
  topic?: string;
  topicKey?: string;
  mode?: string;
  sources?: string[];
  minutes?: number;
  date?: string;
  channelId?: string;
  sourceVideoId?: string;
}

export interface ReadyScriptCheck {
  passed: boolean;
  checkedAt: string;
  /** sha256 of script.txt when it was checked: an edit afterwards needs a new check. */
  scriptHash: string;
  chapters: number;
  chars: number;
  estimatedMinutes: number;
  sources: Array<{ id: string; gram8: number; gram15: number }>;
  problems: string[];
}

export type ReadyScriptLookup =
  | { status: 'ready'; dir: string; text: string; meta: ReadyScriptMeta; check: ReadyScriptCheck }
  | { status: 'missing' | 'unchecked' | 'failed' | 'edited'; dir: string; reason: string };

export function remakeReadyRoot(channelId: string): string {
  return path.join(youtubeChannelDir(channelId), REMAKE_READY_DIR);
}

export function remakeReadyDir(channelId: string, sourceVideoId: string): string {
  return path.join(remakeReadyRoot(channelId), sourceVideoId);
}

export function hashScript(text: string): string {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n').trim()).digest('hex');
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** The ready script for one source video, and why it cannot be used when it cannot. */
export function findReadyScript(channelId: string, sourceVideoId: string): ReadyScriptLookup {
  const dir = remakeReadyDir(channelId, sourceVideoId);
  const scriptFile = path.join(dir, 'script.txt');
  if (!fs.existsSync(scriptFile)) return { status: 'missing', dir, reason: 'chưa có kịch bản viết sẵn' };
  const text = fs.readFileSync(scriptFile, 'utf8');
  const check = readJson<ReadyScriptCheck>(path.join(dir, 'check.json'));
  if (!check) return { status: 'unchecked', dir, reason: 'kịch bản chưa chạy `script check --save`' };
  if (!check.passed) return { status: 'failed', dir, reason: `kịch bản chưa ĐẠT: ${check.problems.slice(0, 3).join(' | ')}` };
  if (check.scriptHash !== hashScript(text)) return { status: 'edited', dir, reason: 'kịch bản đã sửa sau lần kiểm cuối' };
  return { status: 'ready', dir, text, meta: readJson<ReadyScriptMeta>(path.join(dir, 'meta.json')) ?? {}, check };
}

export interface ReadyScriptSummary {
  sourceVideoId: string;
  title: string;
  estimatedMinutes: number;
  checkedAt: string;
}

/** Title of a skill script: meta.json's title, else the "# title" line of script.txt. */
export function readyScriptTitle(text: string, meta: ReadyScriptMeta): string {
  const heading = text.split(/\r?\n/).find(line => /^#\s+\S/.test(line));
  return meta.title?.trim() || heading?.replace(/^#\s+/, '').trim() || '';
}

/**
 * Source videos of a channel whose skill script passed its check and is usable as-is (status "Scripted"):
 * "Chuẩn bị video" will narrate it instead of remaking with an LLM.
 */
export function listReadyScripts(channelId: string): ReadyScriptSummary[] {
  const root = remakeReadyRoot(channelId);
  if (!fs.existsSync(root)) return [];
  const items: ReadyScriptSummary[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const ready = findReadyScript(channelId, entry.name);
    if (ready.status !== 'ready') continue;
    items.push({
      sourceVideoId: entry.name,
      title: readyScriptTitle(ready.text, ready.meta) || entry.name,
      estimatedMinutes: ready.check.estimatedMinutes,
      checkedAt: ready.check.checkedAt,
    });
  }
  return items;
}
