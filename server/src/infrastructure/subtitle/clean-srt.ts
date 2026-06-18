import fs from 'node:fs/promises';

export interface SubtitleBlock {
  rawStart: string;
  rawEnd: string;
  text: string;
}

const MAX_LENGTH_PER_SCREEN = 35;

export function timeToMs(time: string): number {
  const normalized = time.trim().replace(',', '.');
  const [hours, minutes, rest] = normalized.split(':');
  const [seconds, millis = '0'] = rest.split('.');
  return (
    Number(hours) * 3_600_000 +
    Number(minutes) * 60_000 +
    Number(seconds) * 1_000 +
    Number(millis.padEnd(3, '0').slice(0, 3))
  );
}

export function msToTime(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1_000);
  const millis = ms % 1_000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

export function splitJapaneseText(text: string, maxLen = MAX_LENGTH_PER_SCREEN): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxLen) {
    chunks.push(text.slice(i, i + maxLen));
  }
  return chunks;
}

export function processSubtitles(subtitles: SubtitleBlock[]): SubtitleBlock[] {
  const result: SubtitleBlock[] = [];

  subtitles.forEach((sub) => {
    const textToSplit = sub.text.replace(/\n/g, '');

    if (textToSplit.length <= MAX_LENGTH_PER_SCREEN) {
      result.push({ rawStart: sub.rawStart, rawEnd: sub.rawEnd, text: textToSplit });
      return;
    }

    const startMs = timeToMs(sub.rawStart);
    const endMs = timeToMs(sub.rawEnd);
    const totalDuration = endMs - startMs;

    const textChunks = splitJapaneseText(textToSplit);
    const totalChars = textChunks.reduce((acc, chunk) => acc + chunk.length, 0);
    if (totalChars === 0 || totalDuration <= 0) {
      result.push({ rawStart: sub.rawStart, rawEnd: sub.rawEnd, text: textToSplit });
      return;
    }

    let currentStartMs = startMs;

    textChunks.forEach((chunk, index) => {
      const chunkDuration = Math.floor((chunk.length / totalChars) * totalDuration);
      let currentEndMs = currentStartMs + chunkDuration;

      if (index === textChunks.length - 1) currentEndMs = endMs;

      result.push({
        rawStart: msToTime(currentStartMs),
        rawEnd: msToTime(currentEndMs),
        text: chunk,
      });

      currentStartMs = currentEndMs;
    });
  });

  return result;
}

export async function cleanSrt(vttPath: string): Promise<string> {
  console.log('[clean-srt] cleaning subtitle:', vttPath);

  let text = (await fs.readFile(vttPath, 'utf8')).replace(/\r/g, '');

  text = text
    .replace(/^WEBVTT[\s\S]*?\n\n/, '')
    .replace(/align:start position:\d+%/g, '')
    .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, '')
    .replace(/<\/?c[^>]*>/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/&[a-z]+;/g, '')
    .trim();

  const blocks = text
    .split(/(?=\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3})/)
    .map((block) => block.trim())
    .filter(Boolean);

  const cleanedBlocks: SubtitleBlock[] = [];
  let prevLines: string[] = [];

  for (const block of blocks) {
    const [timeLine, ...lines] = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (!timeLine || !timeLine.includes('-->') || lines.join(' ').trim() === '') continue;

    const parts = timeLine.split('-->').map((part) => part.trim());
    const rawStart = parts[0];
    const rawEnd = parts[1];

    const newLines = lines.filter((line) => !prevLines.includes(line));

    if (newLines.length > 0) {
      const cleanedText = newLines.join('\n');
      if (cleanedBlocks.length > 0) {
        cleanedBlocks[cleanedBlocks.length - 1].rawEnd = rawStart;
      }
      cleanedBlocks.push({ rawStart, rawEnd, text: cleanedText });
    }

    prevLines = lines;
  }

  const finalBlocks = processSubtitles(cleanedBlocks);

  const srt = finalBlocks
    .map((block, index) => {
      const normalize = (value: string) => value.replace(/\./g, ',');
      const start = normalize(block.rawStart);
      const end = normalize(block.rawEnd);
      return `${index + 1}\n${start} --> ${end}\n${block.text}\n`;
    })
    .join('\n');

  const srtPath = vttPath.replace(/\.vtt$/i, '.srt');
  await fs.writeFile(srtPath, srt, 'utf8');
  console.log('[clean-srt] done:', srtPath);

  return srtPath;
}
