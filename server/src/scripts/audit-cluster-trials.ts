/**
 * Chấm tự động kết quả chạy thử cụm (thư mục do try-cluster-format.ts tạo ra).
 *   pnpm tsx src/scripts/audit-cluster-trials.ts <runsDir> <subsDir>
 * <runsDir>/K{n}/video-meta.json + thumbnail-candidates/candidates.json, <subsDir>/K{n}.ja.srt
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  checkTitleGuards,
  extractSampleTitles,
  findCopiedSample,
  normalizeTitle,
} from '../modules/video-production/shared/meta/title-guard.js';

const [runsDir, subsDir] = process.argv.slice(2);
if (!runsDir || !subsDir) throw new Error('usage: <runsDir> <subsDir>');

const bigrams = (s: string) => {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i += 1) out.add(s.slice(i, i + 2));
  return out;
};
const share = (part: string, whole: string) => {
  const a = bigrams(normalizeTitle(part));
  if (!a.size) return 1;
  const b = normalizeTitle(whole);
  let hit = 0;
  for (const g of a) if (b.includes(g)) hit += 1;
  return hit / a.size;
};
const pct = (x: number) => `${Math.round(x * 100)}%`;

for (let k = 1; k <= 11; k += 1) {
  const dir = path.join(runsDir, `K${k}`);
  const metaPath = path.join(dir, 'video-meta.json');
  if (!fs.existsSync(metaPath)) {
    console.log(`\n## K${k}: KHÔNG CÓ KẾT QUẢ`);
    continue;
  }
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const transcript = fs.readFileSync(path.join(subsDir, `K${k}.ja.srt`), 'utf8');
  const promptFn = (await import(pathToFileURL(path.resolve(`data/prompts/ja/metadata_tlnb_k${k}/step-1.js`)).href)).default;
  const prompt: string = promptFn('t', 'x', '');
  const samples = extractSampleTitles(prompt);
  const format: string = meta.cluster_format?.format ?? '?';
  const compLine = prompt.split('\n').find((l, i, all) => all[i - 3]?.startsWith(`${format}.`) && l.includes('Composition')) ?? '';
  const examples = [...compLine.matchAll(/「([^」]+)」/g)].map(m => m[1]);

  const title: string = meta.metadata.title;
  const guard = checkTitleGuards({ title, prompt, transcript });
  console.log(`\n## K${k} · ${format} (${meta.cluster_format?.cluster_role})`);
  console.log(`title  : ${title}  [${title.length} ký tự]`);
  console.log(`  guard: ${guard.ok ? 'OK' : guard.reasons.join(' | ')}`);
  console.log(`  bám transcript: ${pct(share(title.split(/[｜|]/)[0], transcript))}`);
  for (const alt of meta.alternative_titles ?? []) {
    const copy = findCopiedSample(alt, samples, transcript);
    console.log(`alt    : ${alt}${copy ? `  ⚠ chép mẫu 「${copy.sample}」` : ''}`);
  }

  const candFile = path.join(dir, 'thumbnail-candidates', 'candidates.json');
  if (!fs.existsSync(candFile)) continue;
  const cands = JSON.parse(fs.readFileSync(candFile, 'utf8')).candidates as Array<{ file?: string; hookLines?: string[]; angle?: string; error?: string }>;
  for (const c of cands) {
    const lines = c.hookLines ?? [];
    const text = lines.join('');
    const longLines = lines.filter(l => l.length > (l.startsWith('※') ? 14 : 12));
    const copiedExamples = lines.filter(l => examples.some(e => normalizeTitle(e) === normalizeTitle(l)));
    console.log(
      `thumb  : ${c.file ?? 'LỖI ' + c.error} ${JSON.stringify(lines)}` +
        `\n  bám transcript ${pct(share(text, transcript))} · khớp title ${pct(share(text, title))}` +
        (longLines.length ? ` · ⚠ dòng quá dài: ${longLines.join(' / ')}` : '') +
        (copiedExamples.length ? ` · ⚠ chép ví dụ composition: ${copiedExamples.join(' / ')}` : ''),
    );
  }
}
