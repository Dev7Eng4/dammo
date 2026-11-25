import fs from 'node:fs';
import path from 'node:path';
import { paths } from '../../config/paths.js';

/**
 * Reading dictionary for narration: a word VOICEVOX reads wrong (誠さん as せいさん, 二〇〇三年 digit by
 * digit) is sent to the voice as the katakana written here. Only the audio changes; script.txt and the
 * subtitles keep the original text. Edit it with `npm run script -- dict` or by hand.
 */
export interface NarrationReading {
  /** Text as written in the script. */
  surface: string;
  /** What to say instead, in katakana (or hiragana). */
  reading: string;
  note?: string;
  addedAt: string;
}

interface ReadingsFile {
  entries: NarrationReading[];
}

export const NARRATION_READINGS_FILE = path.join(paths.dataDir, 'voice-readings.json');

export function readNarrationReadings(): NarrationReading[] {
  try {
    const raw = JSON.parse(fs.readFileSync(NARRATION_READINGS_FILE, 'utf8')) as Partial<ReadingsFile>;
    return (raw.entries ?? []).filter(entry => entry.surface && entry.reading);
  } catch {
    return [];
  }
}

export function writeNarrationReadings(entries: NarrationReading[]): void {
  const sorted = [...entries].sort((a, b) => a.surface.localeCompare(b.surface, 'ja'));
  fs.mkdirSync(path.dirname(NARRATION_READINGS_FILE), { recursive: true });
  fs.writeFileSync(NARRATION_READINGS_FILE, `${JSON.stringify({ entries: sorted }, null, 2)}\n`, 'utf8');
}

/** Adds a word, or changes its reading if it is already there. */
export function upsertNarrationReading(input: { surface: string; reading: string; note?: string }): NarrationReading[] {
  const surface = input.surface.trim();
  const reading = input.reading.trim();
  const entries = readNarrationReadings().filter(entry => entry.surface !== surface);
  entries.push({ surface, reading, ...(input.note?.trim() ? { note: input.note.trim() } : {}), addedAt: new Date().toISOString() });
  writeNarrationReadings(entries);
  return readNarrationReadings();
}

export function removeNarrationReading(surface: string): NarrationReading[] {
  writeNarrationReadings(readNarrationReadings().filter(entry => entry.surface !== surface));
  return readNarrationReadings();
}

/** Text to send to the voice: every dictionary word replaced by its reading, longest words first. */
export function applyNarrationReadings(text: string, entries: NarrationReading[] = readNarrationReadings()): string {
  if (!entries.length) return text;
  const sorted = [...entries].sort((a, b) => b.surface.length - a.surface.length);
  let out = '';
  let i = 0;
  outer: while (i < text.length) {
    for (const entry of sorted) {
      if (text.startsWith(entry.surface, i)) {
        out += entry.reading;
        i += entry.surface.length;
        continue outer;
      }
    }
    out += text[i];
    i += 1;
  }
  return out;
}

const KANJI_NUMERAL = '〇一二三四五六七八九十百千万億兆';
const RISKY_PATTERNS: Array<{ kind: RiskyTerm['kind']; pattern: RegExp }> = [
  // 二〇〇三年, 1973年, 3割, 50代, 2.5倍: numbers with what follows decide the reading.
  { kind: 'number', pattern: new RegExp(`[0-9０-９.．,，${KANJI_NUMERAL}]*[0-9０-９〇][0-9０-９.．,，${KANJI_NUMERAL}]*[\\p{Script=Han}\\p{Script=Katakana}%％]?`, 'gu') },
  // Given names before an honorific: 誠さん (まこと / せい), 恵子さん.
  { kind: 'name', pattern: /\p{Script=Han}{1,3}(?=さん|くん|ちゃん|氏|先生|様)/gu },
  // Latin words and acronyms: NHK, SNS, iPhone.
  { kind: 'latin', pattern: /[A-Za-zＡ-Ｚａ-ｚ][A-Za-zＡ-Ｚａ-ｚ0-9.\-&]*/gu },
  // Same kanji, two readings the engine picks wrong: 行った (いった / おこなった), 〜祭 (まつり / さい).
  { kind: 'homograph', pattern: /行[っわいうえ]|\p{Script=Han}*祭(?!り)/gu },
];

/** Common nouns that take さん (店員さん, 業者さん): not names. */
const NOT_NAMES = new Set(['店員', '業者', '皆', '奥', '客', '医者', '職人', '運転手', '大家', '先輩', '後輩', '隣', '親御', '娘', '息子', '患者', '住職', '駅員', '大工', '庭師', '神主', '旦那']);

export interface RiskyTerm {
  kind: 'number' | 'name' | 'latin' | 'homograph';
  text: string;
}

/**
 * Words VOICEVOX often reads wrong and nobody notices until the video is out: numbers, given names,
 * Latin words. Words already in the dictionary are left out.
 */
export function findRiskyTerms(sentence: string, entries: NarrationReading[] = readNarrationReadings()): RiskyTerm[] {
  const known = entries.map(entry => entry.surface);
  const found: RiskyTerm[] = [];
  for (const { kind, pattern } of RISKY_PATTERNS) {
    for (const match of sentence.matchAll(pattern)) {
      const text = match[0];
      // A plain kanji number word (一つ, 一人, 十分) reads fine; flag only those with 〇 or digits.
      if (kind === 'number' && !/[0-9０-９〇]/.test(text)) continue;
      if (kind === 'name' && NOT_NAMES.has(text)) continue;
      if (known.some(surface => surface.includes(text) || text.includes(surface))) continue;
      if (!found.some(term => term.text === text)) found.push({ kind, text });
    }
  }
  return found;
}
