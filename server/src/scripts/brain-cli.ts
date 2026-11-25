/**
 * CLI for the Claude Code brain skills (.claude/skills/jp-psy-<brain>): runs a brain's own tools and
 * saves into its memory, so a skill does the same job as the in-app brain without the AI loop or an API key.
 *
 *   npm run -s brain -- list                                   # every brain, its skill and the brains it reads
 *   npm run -s brain -- prompt <brainId>                       # the brain's instructions, kinds, tools, feeds
 *   npm run -s brain -- call <brainId> <tool> ['<json input>'] [--out <dir>]
 *   npm run -s brain -- save <brainId> findings.json [--source "..."]
 *   npm run -s brain -- productions [--channel <own channel id>] [--limit N]   # remake/reup videos in data/youtube-channels
 *
 * `call` only runs tools the brain itself has (web_search excepted: use Claude Code's WebSearch).
 * Videos and channels a tool returns are kept in data/trend-scan-cache.json (72 h, shared with `npm run trends`);
 * `save` only accepts those, so ids and numbers are never invented. Image tools (view_thumbnails,
 * view_video_frames) download the images into --out (default: OS temp dir) and print the file paths.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Log } from 'youtubei.js';
import { saveFindingsTool, type BrainContext, type ToolResult } from '../modules/brains/brain-engine.js';
import { BRAIN_AGENTS } from '../modules/brains/brain-agents.js';
import { BRAIN_DEFINITIONS, findBrainDefinition } from '../modules/brains/brains.registry.js';
import type { TrendVideo } from '../modules/brains/youtube-trends.js';
import { readCache, saveFindings, writeCache, type ScanCache } from './lib/brain-skill-store.js';

Log.setLevel(Log.Level.NONE);

/** Brains whose skill is not jp-psy-<brain id>: title and thumbnail share one skill, script has two. */
const SKILL_OVERRIDES: Record<string, string> = { 'jp-psy-trends': 'jp-psy-trends', 'title-seo': 'jp-psy-ctr', thumbnail: 'jp-psy-ctr', script: 'jp-psy-script-niche / jp-psy-script-remake' };
export const BRAIN_SKILLS: Record<string, string> = Object.fromEntries(
  BRAIN_DEFINITIONS.map(b => [b.id, SKILL_OVERRIDES[b.id] ?? `jp-psy-${b.id}`]),
);

function parseArgs(argv: string[]) {
  const flags: Record<string, string> = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) flags[arg.slice(2)] = argv[(i += 1)] ?? '';
    else rest.push(arg);
  }
  return { flags, rest };
}

function requireBrain(id: string | undefined) {
  const def = id ? findBrainDefinition(id) : undefined;
  const spec = id ? BRAIN_AGENTS[id] : undefined;
  if (!def || !spec) {
    throw new Error(`Unknown brain "${id ?? ''}". Brains: ${BRAIN_DEFINITIONS.map(b => b.id).join(', ')}`);
  }
  return { def, spec };
}

const toolName = (tool: { definition: unknown }) => (tool.definition as { name: string }).name;

function list() {
  for (const def of BRAIN_DEFINITIONS) {
    const spec = BRAIN_AGENTS[def.id];
    console.log(
      `${def.id} | ${def.name} | ${def.department} | skill: ${BRAIN_SKILLS[def.id]} | kinds: ${spec?.kinds.join(',') ?? '-'} | reads: ${def.feeds.join(', ') || '-'}`,
    );
  }
}

function prompt(id: string | undefined) {
  const { def, spec } = requireBrain(id);
  const tools = spec.tools.map(tool => {
    const definition = tool.definition as { name: string; description?: string; input_schema?: unknown };
    if (!tool.run) return `- ${definition.name}: server tool → dùng WebSearch của Claude Code (truy vấn tiếng Nhật)`;
    return `- ${definition.name}: ${definition.description ?? ''}\n  input: ${JSON.stringify(definition.input_schema ?? {})}`;
  });
  console.log(
    [
      `# ${def.name} (${def.id}) — ${def.department}`,
      def.description,
      `Đọc bộ nhớ của: ${def.feeds.join(', ') || '(không)'}`,
      `Được lưu các loại nơ-ron: ${spec.kinds.join(', ')}${spec.requireCluster ? ' (video bắt buộc có cluster K1–K11 hoặc off)' : ''}`,
      '',
      '## Kickoff',
      spec.kickoff({} as BrainContext),
      '',
      '## System prompt của bộ não',
      spec.system,
      '',
      '## Công cụ (npm run -s brain -- call ' + def.id + ' <tool> \'<json>\')',
      ...tools,
      '',
      '## save_findings (npm run -s brain -- save ' + def.id + ' <file.json>)',
      JSON.stringify((saveFindingsTool(spec.kinds, spec.requireCluster).definition as { input_schema: unknown }).input_schema),
    ].join('\n'),
  );
}

/** A context backed by the scan cache, so what one CLI call fetches is "seen" for later calls and for save. */
function cacheContext(brainId: string, cache: ScanCache): { ctx: BrainContext; persist: () => void } {
  const seen = new Map<string, TrendVideo>(
    Object.entries(cache.videos).map(([id, { fetchedAt: _fetchedAt, ...video }]) => [id, video]),
  );
  const seenChannels = new Map(Object.entries(cache.channels).map(([id, c]) => [id, { name: c.name, subscribers: c.subscribers }]));
  const ratios = new Map(Object.entries(cache.ratios));
  const before = { videos: new Map(seen), channels: new Map(seenChannels) };
  const ctx: BrainContext = {
    brainId,
    signal: new AbortController().signal,
    pulse: (kind, text) => console.error(`[${kind}] ${text}`),
    save: () => {
      throw new Error('Use `npm run -s brain -- save` to store findings.');
    },
    usage: () => {},
    seen,
    seenChannels,
    ratios,
  };
  const persist = () => {
    const now = new Date().toISOString();
    for (const [id, video] of seen) if (before.videos.get(id) !== video) cache.videos[id] = { ...video, fetchedAt: now };
    for (const [id, channel] of seenChannels) if (before.channels.get(id) !== channel) cache.channels[id] = { ...channel, fetchedAt: now };
    for (const [id, ratio] of ratios) cache.ratios[id] = ratio;
    writeCache(cache);
  };
  return { ctx, persist };
}

async function printResult(result: ToolResult, outDir: string, tool: string) {
  if (typeof result === 'string') {
    console.log(result);
    return;
  }
  const dir = path.join(outDir, `${tool}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  let label = 'image';
  let index = 0;
  for (const block of result ?? []) {
    if (block.type === 'text') {
      console.log(block.text);
      label = block.text.split(' | ')[0].replace(/[^\w-]/g, '') || 'image';
      index = 0;
    } else if (block.type === 'image' && block.source.type === 'url') {
      index += 1;
      const file = path.join(dir, `${label}-${index}.jpg`);
      try {
        const response = await fetch(block.source.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
        console.log(`  IMAGE ${file.replaceAll('\\', '/')}`);
      } catch (err) {
        console.log(`  IMAGE ${block.source.url} — ERROR ${(err as Error).message}`);
      }
    }
  }
}

async function call(id: string | undefined, name: string | undefined, rawInput: string | undefined, flags: Record<string, string>) {
  const { def, spec } = requireBrain(id);
  const tool = spec.tools.find(t => toolName(t) === name);
  if (!tool) {
    throw new Error(`Brain ${def.id} has no tool "${name ?? ''}". Tools: ${spec.tools.map(toolName).join(', ')}`);
  }
  if (!tool.run) {
    console.log(`${name} là công cụ chạy phía Anthropic: dùng WebSearch của Claude Code (truy vấn tiếng Nhật) thay cho lệnh này.`);
    return;
  }
  let input: unknown = {};
  if (rawInput?.trim()) {
    const text = fs.existsSync(rawInput) ? fs.readFileSync(rawInput, 'utf-8') : rawInput;
    input = JSON.parse(text);
  }
  const cache = readCache();
  const { ctx, persist } = cacheContext(def.id, cache);
  const result = await tool.run(input, ctx);
  persist();
  await printResult(result, flags.out || path.join(os.tmpdir(), 'dammo-brain-images'), name!);
}

const readJsonFile = (file: string): any => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return undefined;
  }
};

/**
 * Videos made by the remake / reup pipelines live in data/youtube-channels/<id>/videos/<videoId>/,
 * which list_my_productions (Agent tạo video runs only) does not see. Skills read them here.
 */
async function productions(flags: Record<string, string>) {
  const { youtubeChannelsRepository } = await import('../modules/youtube-channels/youtube-channels.repository.js');
  const { paths } = await import('../config/paths.js');
  const { nichesRepository } = await import('../modules/niches/niches.repository.js');
  const niches = nichesRepository.findAll();
  const nicheName = (id: string) => niches.find(n => n.key === id)?.label ?? id;
  const root = path.join(paths.dataDir, 'youtube-channels');
  const limit = Number(flags.limit ?? 15);
  const channels = youtubeChannelsRepository.findAll().filter(c => c.status !== 'deleted' && (!flags.channel || c.id === flags.channel));
  for (const channel of channels) {
    const dir = path.join(root, channel.id);
    const videosDir = path.join(dir, 'videos');
    const prepared: Array<{ videoId: string; title?: string; status?: string }> = readJsonFile(path.join(dir, 'video-prepare.json')) ?? [];
    const folders = fs.existsSync(videosDir)
      ? fs
          .readdirSync(videosDir)
          .map(name => ({ name, mtime: fs.statSync(path.join(videosDir, name)).mtimeMs }))
          .sort((a, b) => b.mtime - a.mtime)
      : [];
    if (!prepared.length && !folders.length) continue;
    const byStatus = new Map<string, number>();
    for (const p of prepared) byStatus.set(p.status ?? '?', (byStatus.get(p.status ?? '?') ?? 0) + 1);
    console.log(
      `\n### ${channel.id} | ${channel.name} | niche: ${nicheName(channel.niche)} | type: ${channel.type} | ${folders.length} video folders | prepare: ${[...byStatus].map(([s, n]) => `${s} ${n}`).join(', ') || '-'}`,
    );
    for (const folder of folders.slice(0, limit)) {
      const v = path.join(videosDir, folder.name);
      const meta = readJsonFile(path.join(v, 'video-meta.json'));
      const state = readJsonFile(path.join(v, 'remake-state.json'));
      const scenes = readJsonFile(path.join(v, 'ai-scene-prompts.json'));
      const render = readJsonFile(path.join(v, 'ai-render-config.json'));
      const scriptFile = path.join(v, 'script.txt');
      const chars = fs.existsSync(scriptFile) ? Array.from(fs.readFileSync(scriptFile, 'utf-8').replace(/\s/g, '')).length : 0;
      const durationSec: number | undefined = state?.voice?.durationSec;
      const minutes = durationSec ? durationSec / 60 : undefined;
      const sceneCount: number | undefined = scenes?.sceneCount ?? (Array.isArray(scenes?.scenes) ? scenes.scenes.length : undefined);
      const status = prepared.find(p => p.videoId === folder.name)?.status ?? '-';
      console.log(
        [
          `${folder.name} | ${status} | ${new Date(folder.mtime).toISOString().slice(0, 10)}`,
          `title: ${meta?.metadata?.title ?? prepared.find(p => p.videoId === folder.name)?.title ?? '?'}`,
          meta?.cluster_format?.format ? `format: ${meta.cluster_format.format} (${meta.cluster_format.cluster_role ?? '?'})` : '',
          chars ? `script ${chars} chars` : 'no script',
          state?.voice ? `voice speaker ${state.voice.speaker} x${state.voice.speedScale}` : '',
          minutes ? `${minutes.toFixed(1)} min, ${Math.round(chars / minutes)} chars/min` : '',
          render?.audioSpeed ? `audioSpeed ${Number(render.audioSpeed).toFixed(2)}` : '',
          sceneCount ? `${sceneCount} scenes${durationSec ? ` (${(durationSec / sceneCount).toFixed(1)} s/scene)` : ''}` : '',
          fs.existsSync(path.join(v, 'thumbnail.jpg')) ? 'thumbnail yes' : 'thumbnail no',
          meta?.thumbnail?.hook_lines ? `hook: ${meta.thumbnail.hook_lines.join(' / ')}` : '',
          meta?.ctr_review ? `ctr ${meta.ctr_review.status} ${meta.ctr_review.after?.score ?? meta.ctr_review.score}/10` : '',
        ]
          .filter(Boolean)
          .join(' | '),
      );
    }
    if (folders.length > limit) console.log(`… ${folders.length - limit} older folders (use --limit)`);
  }
}

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  const { flags, rest } = parseArgs(argv);
  if (command === 'list') return list();
  if (command === 'productions') return productions(flags);
  if (command === 'prompt') return prompt(rest[0]);
  if (command === 'call') return call(rest[0], rest[1], rest[2], flags);
  if (command === 'save') {
    const { def } = requireBrain(rest[0]);
    if (!rest[1]) throw new Error('Usage: brain save <brainId> findings.json');
    await saveFindings(def.id, rest[1], readCache(), flags.source || `skill Claude Code ${BRAIN_SKILLS[def.id]}`);
    return;
  }
  console.error('Usage: brain list | productions [--channel id] [--limit N] | prompt <brainId> | call <brainId> <tool> [json] [--out dir] | save <brainId> <file.json> (see file header)');
  process.exit(1);
}

main().then(
  () => process.exit(0),
  err => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
