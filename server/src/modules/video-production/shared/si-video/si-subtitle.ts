import fs from 'node:fs';
import path from 'node:path';
import {
  type CaptionStyleKey,
  type CaptionStylePreset,
  getCaptionStylePreset,
  resolveCaptionStyleKey,
} from './caption-styles.js';
import {
  SI_CANVAS_H,
  SI_CANVAS_W,
  SI_SUBTITLE_CHAR_SPACING,
  SI_SUBTITLE_LINE_GAP_PX,
  SI_SUBTITLE_MARGIN_BOTTOM_PX,
  SI_SUBTITLE_PADDING_HORIZONTAL,
} from './si.constants.js';

export interface ConvertSrtToAssOptions {
  captionStyleKey?: CaptionStyleKey | string | null;
  japaneseStyle?: boolean;
  fontFile?: string;
}

function srtTimeToMs(h: string, m: string, s: string, ms: string): number {
  return Number.parseInt(h) * 3600000 + Number.parseInt(m) * 60000 + Number.parseInt(s) * 1000 + Number.parseInt(ms);
}

function msToSrtTime(totalMs: number): string {
  const ms = Math.round(totalMs);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const msPart = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(msPart).padStart(3, '0')}`;
}

export function scaleSrtTimestamps(srtPath: string, outputSrtPath: string, speed: number): void {
  const content = fs.readFileSync(srtPath, 'utf8').replace(/\r/g, '');
  const factor = 1 / speed;
  const timeRe = /(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})/g;

  const scaled = content.replace(timeRe, (_match, h1, m1, s1, ms1, h2, m2, s2, ms2) => {
    const startMs = srtTimeToMs(h1, m1, s1, ms1) * factor;
    const endMs = srtTimeToMs(h2, m2, s2, ms2) * factor;
    return `${msToSrtTime(startMs)} --> ${msToSrtTime(endMs)}`;
  });

  fs.writeFileSync(outputSrtPath, scaled, 'utf-8');
}

export function escapePathForFfmpegSubtitles(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\''");
}

export function resolveJapaneseSubtitleStyle(subtitlePath: string | null, videoLanguage?: string): boolean {
  const raw = videoLanguage?.trim().toLowerCase() ?? '';
  if (raw === 'ja' || raw === 'jp') return true;
  if (raw && raw !== 'ja' && raw !== 'jp') return false;
  if (!subtitlePath) return false;
  return /\.ja\.(srt|vtt)$/i.test(path.basename(subtitlePath));
}

function buildAssStyleLine(
  name: string,
  fontName: string,
  fontSize: number,
  primaryColor: string,
  outlinePx: number,
  shadowPx: number,
): string {
  return `Style: ${name},${fontName},${fontSize},${primaryColor},&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,${SI_SUBTITLE_CHAR_SPACING},0,1,${outlinePx},${shadowPx},2,${SI_SUBTITLE_PADDING_HORIZONTAL},${SI_SUBTITLE_PADDING_HORIZONTAL},0,1\r`;
}

function buildAssStyles(fontName: string, fontSize: number, preset: CaptionStylePreset): string {
  if (preset.assLayout === 'glow_dual') {
    const glowColor = preset.glowPrimaryColor ?? '&H00C8FF00';
    const glowPx = preset.glowOutlinePx ?? 10;
    return (
      buildAssStyleLine('Glow', fontName, fontSize, glowColor, glowPx, 0) +
      buildAssStyleLine('Default', fontName, fontSize, preset.primaryColor, preset.outlinePx, 0)
    );
  }

  return buildAssStyleLine(
    'Default',
    fontName,
    fontSize,
    preset.primaryColor,
    preset.outlinePx,
    preset.shadowPx,
  );
}

function buildAssEvent(
  start: string,
  end: string,
  eventMarginV: number,
  baseText: string,
  preset: CaptionStylePreset,
): string {
  if (preset.assLayout === 'glow_dual') {
    const blur = preset.glowBlur ?? 10;
    return (
      `Dialogue: 0,${start},${end},Glow,,0,0,${eventMarginV},,{\\blur${blur}}${baseText}\n` +
      `Dialogue: 1,${start},${end},Default,,0,0,${eventMarginV},,${baseText}\n`
    );
  }

  return `Dialogue: 0,${start},${end},Default,,0,0,${eventMarginV},,${baseText}\n`;
}

export function convertSrtToAss(
  srtPath: string,
  assPath: string,
  options: ConvertSrtToAssOptions = {},
): void {
  const content = fs.readFileSync(srtPath, 'utf8').replace(/\r/g, '');
  const cues = content.split(/\n\n+/).filter(Boolean);

  const styleKey = resolveCaptionStyleKey(options.captionStyleKey);
  const preset = getCaptionStylePreset(styleKey);
  const fontFile = options.fontFile;
  const fontExists = fontFile ? fs.existsSync(fontFile) : false;
  const fontName = fontExists ? preset.fontAssName : 'Arial';
  const fontSize = preset.fontSize;

  const subtitleBoxHeight = Math.floor(SI_CANVAS_H / 3);
  const boxMidY = preset.showBackgroundBox
    ? Math.round(SI_CANVAS_H - SI_SUBTITLE_MARGIN_BOTTOM_PX - subtitleBoxHeight / 2)
    : Math.round(SI_CANVAS_H - SI_SUBTITLE_MARGIN_BOTTOM_PX - fontSize / 2);

  const header = `[Script Info]\r
ScriptType: v4.00+\r
PlayResX: ${SI_CANVAS_W}\r
PlayResY: ${SI_CANVAS_H}\r
WrapStyle: 1\r
\r
[V4+ Styles]\r
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\r
${buildAssStyles(fontName, fontSize, preset)}
\r
[Events]\r
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\r
`;

  let events = '';
  for (const cue of cues) {
    const lines = cue
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
    const timeRe = /(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})/;
    let timeLineIdx = -1;
    let match: RegExpMatchArray | null = null;

    for (let i = 0; i < lines.length; i++) {
      match = lines[i].match(timeRe);
      if (match) {
        timeLineIdx = i;
        break;
      }
    }

    if (timeLineIdx === -1 || !match) continue;

    const formatTime = (h: string, m: string, s: string, ms: string) => {
      const cs = Math.floor(Number.parseInt(ms) / 10)
        .toString()
        .padStart(2, '0');
      return `${Number.parseInt(h)}:${m}:${s}.${cs}`;
    };

    const start = formatTime(match[1], match[2], match[3], match[4]);
    const end = formatTime(match[5], match[6], match[7], match[8]);
    const textLines = lines.slice(timeLineIdx + 1);

    const cw = SI_CANVAS_W - SI_SUBTITLE_PADDING_HORIZONTAL * 2;
    const cSize = fontSize - SI_SUBTITLE_CHAR_SPACING * 5;
    const maxCharsPerLine = Math.max(1, Math.floor(cw / cSize));

    const wrappedLines: string[] = [];
    for (const rawLine of textLines) {
      let currentLine = '';
      for (const char of Array.from(rawLine)) {
        if (currentLine.length >= maxCharsPerLine) {
          wrappedLines.push(currentLine);
          currentLine = '';
        }
        currentLine += char;
      }
      if (currentLine) wrappedLines.push(currentLine);
    }

    const extraGapPx = SI_SUBTITLE_LINE_GAP_PX;
    const lineBreakStr =
      extraGapPx > 0 ? `\\N{\\fs${extraGapPx}}\\h\\N{\\fs${fontSize}}` : '\\N';
    const baseText = wrappedLines.join(lineBreakStr);

    const numLines = wrappedLines.length;
    const totalTextH = numLines * fontSize + Math.max(0, numLines - 1) * SI_SUBTITLE_LINE_GAP_PX;
    const eventMarginV = Math.max(0, Math.round(SI_CANVAS_H - boxMidY - totalTextH / 2));

    events += buildAssEvent(start, end, eventMarginV, baseText, preset);
  }

  fs.writeFileSync(assPath, header + events, 'utf-8');
}
