/**
 * Data and machine checks for the jp-psy-ctr skill: gathers one dammo video (script, cluster, current title,
 * thumbnail text, images) and checks titles and thumbnail text AS PAIRS, with the meta pipeline's own title guard.
 *
 * Run from the repo root:
 *   CHECK=.claude/skills/jp-psy-ctr/scripts/ctr-check.mts
 *   server/node_modules/.bin/tsx $CHECK <videoDir | videoId> [--pair "title || line1|line2"]... [--cluster K1]
 *   server/node_modules/.bin/tsx $CHECK --cluster K1 --text notes.txt --pair "title || line1|line2"   # idea without a video
 * Prints one JSON object on stdout.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
const dataDir = path.join(repoRoot, 'server/data');
const channelsDir = path.join(dataDir, 'youtube-channels');

const guard = await import(
  pathToFileURL(path.join(repoRoot, 'server/src/modules/video-production/shared/meta/title-guard.ts')).href
);

// ---------- args ----------
const argv = process.argv.slice(2);
const target = argv.find((arg, i) => !arg.startsWith('--') && !['--pair', '--cluster', '--text'].includes(argv[i - 1]));
const optionValues = (flag: string) => argv.flatMap((arg, i) => (arg === flag && argv[i + 1] ? [argv[i + 1]] : []));
const proposedPairs = optionValues('--pair').map(value => {
  const [title, hook = ''] = value.split('||');
  return { title: title.trim(), hookLines: hook.split('|').map(line => line.trim()).filter(Boolean) };
});
const textFile = optionValues('--text')[0];
const clusterOverride = optionValues('--cluster')[0]?.toUpperCase();

if (!target && !(clusterOverride && textFile)) {
  console.error('Usage: ctr-check.mts <videoDir | videoId> [--pair "title || line1|line2"] [--cluster K1] or: ctr-check.mts --cluster K1 --text <file> --pair "title || line1|line2"');
  process.exit(1);
}

// ---------- locate the video ----------
function findVideoDir(input: string): string | undefined {
  const asPath = path.resolve(input);
  if (existsSync(asPath) && statSync(asPath).isDirectory()) return asPath;
  if (!existsSync(channelsDir)) return undefined;
  for (const channel of readdirSync(channelsDir)) {
    const candidate = path.join(channelsDir, channel, 'videos', input);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

const videoDir = target ? findVideoDir(target) : undefined;
if (target && !videoDir) {
  console.error(`Video not found: ${target}`);
  process.exit(1);
}
// Idea mode has no folder: every lookup below then misses and only the cluster prompt and --text are used.
const baseDir = videoDir ?? path.join(here, '__no_video__');
const channelDir = path.resolve(baseDir, '../..');
const channelId = videoDir ? path.basename(channelDir) : '';

const readJson = (file: string): any => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
};
const rel = (file: string) => path.relative(repoRoot, file).replaceAll('\\', '/');
const fileIfExists = (file: string) => (existsSync(file) ? rel(file) : null);

// ---------- channel + cluster ----------
const channelsJson = readJson(path.join(dataDir, 'youtube-channels.json'));
const channelList: any[] = Array.isArray(channelsJson) ? channelsJson : channelsJson?.channels ?? Object.values(channelsJson ?? {});
const channel = channelList.find(item => item?.id === channelId);
const meta = readJson(path.join(baseDir, 'video-meta.json'));

const nicheMatch = /ja-psy-k(\d+)/i.exec(channel?.niche ?? '');
const formatMatch = /^K(\d+)/i.exec(meta?.cluster_format?.format ?? meta?.thumbnail?.format ?? '');
const cluster =
  clusterOverride ??
  (nicheMatch ? `K${nicheMatch[1]}` : undefined) ??
  channel?.trendClusters?.[0]?.toUpperCase() ??
  (formatMatch ? `K${formatMatch[1]}` : undefined) ??
  null;
const clusterSource = clusterOverride
  ? '--cluster'
  : nicheMatch
    ? 'channel.niche'
    : channel?.trendClusters?.[0]
      ? 'channel.trendClusters'
      : formatMatch
        ? 'video-meta format'
        : null;

const promptFile = cluster ? path.join(dataDir, `prompts/ja/metadata_tlnb_${cluster.toLowerCase()}/step-1.js`) : null;
const promptText = promptFile && existsSync(promptFile) ? readFileSync(promptFile, 'utf8') : '';
const clusterRef = cluster ? path.join(repoRoot, `.claude/skills/jp-psy-cluster/references/clusters/${cluster.toLowerCase()}.md`) : null;

// ---------- script / transcript ----------
const scriptCandidates = ['script.txt', 'narration/transcript.srt', 'transcript.srt', 'transcript.ja.srt'];
const scriptFile = textFile ? path.resolve(textFile) : scriptCandidates.map(name => path.join(baseDir, name)).find(existsSync);
const rawScript = scriptFile ? readFileSync(scriptFile, 'utf8') : '';
const transcript = scriptFile?.endsWith('.srt')
  ? rawScript
      .split(/\r?\n/)
      .filter(line => line.trim() && !/^\d+$/.test(line.trim()) && !/-->/.test(line))
      .join('\n')
  : rawScript;
const headings = rawScript.split(/\r?\n/).filter(line => /^#{1,3}\s/.test(line));
const remakeState = readJson(path.join(baseDir, 'remake-state.json'));
const durationSec = remakeState?.voice?.durationSec;

// ---------- checks ----------
const NOISE_FOR_COUNT = /[\s]/g;
const countChars = (text: string) => Array.from(text.replace(NOISE_FOR_COUNT, '')).length;
const KATAKANA_TERM = /[ァ-ヴ][ァ-ヴー]{3,}/g;
const AGE_WORDS = ['50代', '60代', '70代', '80代', '定年後', '老後', '人生後半', '退職後', '還暦'];
const WINNING = [
  { label: 'mệnh lệnh 〜なさい/〜てください (×2.9)', re: /なさい|てください|でください/ },
  { label: '一度でも / 絶対 (×1.6)', re: /一度でも|絶対/ },
  { label: 'giấu 「これ」/この〜/〇〇 (×1.4)', re: /「これ」|『これ』|この[^\s]|〇〇/ },
  { label: 'con số N選 / Nつ (×1.4)', re: /[0-9０-９二三四五六七八九十]+(選|つ)/ },
  { label: '【※99%が知らない】/【9割が知らない】 (×1.3)', re: /【※?(99%|９９％|9割|９割)が知らない】/ },
];
const LOSING = [
  { label: 'なぜ / 理由 (×0.81)', re: /なぜ|理由/ },
  { label: '才能 / 能力 / 最強 (×0.68)', re: /才能|能力|最強/ },
  { label: '脳科学 (×0.86 khi làm hook chính)', re: /脳科学/ },
];

const samples: string[] = guard.extractSampleTitles(promptText);
const compositionExamples: string[] = guard.extractCompositionExamples(promptText);
const sourceTitle: string = meta?.source_title ?? '';

function checkTitle(title: string) {
  const length = countChars(title);
  const numbers = [...title.matchAll(/([0-9０-９]+)(選|つ)/g)].map(m => Number(m[1].replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xfee0))));
  const sourceCopy = sourceTitle ? guard.findSourceTitleCopy(title, sourceTitle) : undefined;
  const sampleCopy = samples.length ? guard.findCopiedSample(title, samples, transcript) : undefined;
  return {
    title,
    length,
    lengthOk: length >= 30 && length <= 70,
    first30: Array.from(title).slice(0, 30).join(''),
    bracketLabels: title.match(/【[^】]*】/g) ?? [],
    startsWithJitsuwa: /^(【[^】]*】)?\s*実は/.test(title),
    afterBar: title.includes('｜') ? title.split('｜').slice(1).join('｜') : null,
    listNumbers: numbers,
    katakanaTerms: [...new Set(title.match(KATAKANA_TERM) ?? [])],
    ageWords: AGE_WORDS.filter(word => title.includes(word)).map(word => ({ word, inTranscript: transcript.includes(word) })),
    winningDevices: WINNING.filter(item => item.re.test(title)).map(item => item.label),
    losingDevices: LOSING.filter(item => item.re.test(title)).map(item => item.label),
    unsupportedPromises: guard.findUnsupportedPromises(title, transcript),
    unsupportedStats: guard.findUnsupportedStats(title, transcript),
    keepsSourceTitle: sourceCopy
      ? { containment: Math.round(sourceCopy.containment * 100) / 100, sharedRun: sourceCopy.sharedRun }
      : null,
    copiesSample: sampleCopy
      ? { sample: sampleCopy.sample, containment: Math.round(sampleCopy.containment * 100) / 100, sharedRun: sampleCopy.sharedRun }
      : null,
  };
}

/** Longest run of characters two strings share (punctuation and brackets ignored). */
function sharedRun(a: string, b: string): string {
  const x = guard.normalizeTitle(a);
  const y = guard.normalizeTitle(b);
  let best = '';
  for (let i = 0; i < x.length; i += 1) {
    for (let j = i + best.length + 1; j <= x.length && y.includes(x.slice(i, j)); j += 1) best = x.slice(i, j);
  }
  return best;
}

/** How title and thumbnail text split the work: what they share, what only the thumbnail says. */
function checkPair(title: string, lines: string[]) {
  const guardResult = guard.checkTitleGuards({ title, prompt: promptText, transcript, hookLines: lines, sourceTitle, alternativeTitles: [] });
  const perLine = lines.map(line => {
    const run = sharedRun(line, title);
    const size = guard.normalizeTitle(line).length;
    return { line, sharedWithTitle: run, sharePercent: size ? Math.round((run.length / size) * 100) : 0 };
  });
  return {
    title,
    hookLines: lines,
    readAloud: `${lines.join(' ')} → ${title}`,
    /** Same check the meta pipeline runs; a title that fails here would be rejected there. */
    pipelineGuard: { ok: guardResult.ok, reasons: guardResult.reasons },
    sharedAnchor: sharedRun(lines.join(''), title),
    perLine,
    /** At least one line must say something the title does not. */
    thumbnailAddsSomething: perLine.some(item => item.sharePercent < 50),
    totalHookChars: lines.reduce((sum, line) => sum + countChars(line), 0),
    numbersInBoth: [...new Set(lines.join(' ').match(/[0-9０-９]+/g) ?? [])].filter(num => title.includes(num)),
    titleCheck: checkTitle(title),
    hookCheck: checkHooks(lines, title),
  };
}

function checkHooks(lines: string[], title: string) {
  return {
    lines: lines.map(line => {
      const isNote = line.trim().startsWith('※');
      const length = countChars(line);
      const limit = isNote ? 14 : 12;
      return {
        line,
        length,
        limit,
        tooLong: length > limit,
        startsWithParticle: /^[のはがをにでもへとや]/.test(line.replace(/^※/, '')),
        inTranscript: transcript.includes(line.replace(/^※/, '').replace(/[「」『』]/g, '')),
      };
    }),
    onlyRepeatTitle: guard.hookLinesOnlyRepeatTitle(lines, title),
    copiedCompositionExamples: guard.findCopiedHookLines(lines, compositionExamples, transcript),
  };
}

const currentTitle: string = meta?.metadata?.title ?? '';
/** Thumbnail text as stored by any of the meta prompts (cluster plan, telop, quote lines). */
function storedHookLines(plan: any): string[] {
  if (Array.isArray(plan?.hook_lines)) return plan.hook_lines;
  const pick = (source: any, keys: string[]) =>
    keys.map(key => source?.[key]?.text ?? source?.[key]).filter((v: unknown): v is string => typeof v === 'string' && v.trim() !== '');
  const telop = plan?.telop_japanese;
  if (telop && typeof telop === 'object') return pick(telop, Object.keys(telop).filter(key => !/color|accent|emphasis|note/i.test(key)));
  return pick(plan, ['line_1', 'line_2', 'line_3', 'vertical_name_tag']);
}
const currentHooks: string[] = storedHookLines(meta?.thumbnail);

const candidatesJson = readJson(path.join(baseDir, 'thumbnail-candidates/candidates.json'));
const candidateDir = path.join(baseDir, 'thumbnail-candidates');
const candidateImages = existsSync(candidateDir)
  ? readdirSync(candidateDir).filter(name => /\.(jpe?g|png|webp)$/i.test(name)).map(name => rel(path.join(candidateDir, name)))
  : [];

const result = {
  paths: {
    repoRoot: repoRoot.replaceAll('\\', '/'),
    videoDir: videoDir ? rel(videoDir) : null,
    channelDir: videoDir ? rel(channelDir) : null,
    script: scriptFile ? rel(scriptFile) : null,
    thumbnail: fileIfExists(path.join(baseDir, 'thumbnail.jpg')),
    thumbnailCandidates: candidateImages,
    mascotImage: fileIfExists(path.join(channelDir, 'mascot.jpg')),
    mascotProfile: fileIfExists(path.join(channelDir, 'mascot-profile.json')),
    clusterPrompt: promptFile && existsSync(promptFile) ? rel(promptFile) : null,
    clusterReference: clusterRef && existsSync(clusterRef) ? rel(clusterRef) : null,
  },
  channel: channel
    ? {
        id: channel.id,
        name: channel.name,
        niche: channel.niche,
        trendClusters: channel.trendClusters,
        thumbnailStyleKey: channel.thumbnailStyleKey,
        type: channel.type,
      }
    : { id: channelId, note: 'channel not found in youtube-channels.json' },
  cluster: { code: cluster, source: clusterSource, promptHasSamples: samples.length > 0 },
  video: {
    videoId: meta?.videoId ?? (videoDir ? path.basename(videoDir) : null),
    sourceTitle,
    detectedNiche: meta?.detected_niche ?? null,
    clusterFormat: meta?.cluster_format ?? null,
    title: currentTitle,
    alternativeTitles: meta?.alternative_titles ?? [],
    description: meta?.metadata?.description ?? null,
    tags: meta?.metadata?.tags ?? [],
    thumbnail: meta?.thumbnail
      ? {
          format: meta.thumbnail.format,
          formatName: meta.thumbnail.format_name,
          hookLines: currentHooks,
          emphasis: meta.thumbnail.emphasis,
          scene: meta.thumbnail.scene,
          mascotPose: meta.thumbnail.mascot_pose,
        }
      : null,
    selectedCandidate: candidatesJson
      ? {
          selectedFile: candidatesJson.selectedFile,
          aiPickedFile: candidatesJson.aiPickedFile,
          // Text each candidate image was drawn with: compare the real image against this, not only the meta plan.
          candidates: (candidatesJson.candidates ?? []).map((c: any) => ({ angle: c.angle, hookLines: c.hookLines, emphasis: c.emphasis })),
        }
      : null,
  },
  script: {
    chars: countChars(transcript),
    durationMin: durationSec ? Math.round((durationSec / 60) * 10) / 10 : null,
    headings,
  },
  checks: {
    currentPair: currentTitle ? checkPair(currentTitle, currentHooks) : null,
    alternativeTitles: (meta?.alternative_titles ?? []).map(checkTitle),
  },
  proposals: proposedPairs.length ? proposedPairs.map(pair => checkPair(pair.title, pair.hookLines)) : undefined,
};

console.log(JSON.stringify(result, null, 2));
