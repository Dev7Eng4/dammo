import fs from 'node:fs';
import path from 'node:path';
import {
  type CaptionStyleKey,
  type CaptionStylePreset,
  getCaptionStylePreset,
  resolveCaptionStyleKey,
} from './caption-styles.js';
import {
  CANVAS_H,
  CANVAS_W,
  DISCLAIMER_DURATION_SEC,
  DISCLAIMER_FONT_SIZE,
  DISCLAIMER_MARGIN_LEFT_PX,
  DISCLAIMER_MARGIN_TOP_PX,
  DISCLAIMER_PRIMARY_COLOR,
  DISCLAIMER_TEXT,
  SUBTITLE_CHAR_SPACING,
  SUBTITLE_LINE_GAP_PX,
  SUBTITLE_PADDING_HORIZONTAL,
  resolveSubtitleMarginBottomPx,
} from './canvas.constants.js';
import { type CaptionCue, resegmentJapaneseCues, wrapCaptionText } from './caption-segment.js';

export { resolveSmallVideoClip, type SmallVideoClip } from './small-video.js';

export interface ConvertSrtToAssOptions {
  captionStyleKey?: CaptionStyleKey | string | null;
  /** Japanese track: cues are re-cut along sentences and 、 so none ends mid-word. */
  japaneseStyle?: boolean;
  fontFile?: string;
  /** Temporary flag: burn top-left disclaimer for the first N seconds. */
  showDisclaim?: boolean;
  disclaimerText?: string;
}

function srtTimeToMs(h: string, m: string, s: string, ms: string): number {
  return Number.parseInt(h) * 3600000 + Number.parseInt(m) * 60000 + Number.parseInt(s) * 1000 + Number.parseInt(ms);
}

const SRT_TIME_RE = /(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})/;

/** Parses SRT text into cues; multi-line cue text is kept joined with `\n`. */
export function parseSrtCues(content: string): CaptionCue[] {
  const cues: CaptionCue[] = [];
  for (const block of content.replace(/\r/g, '').split(/\n\n+/)) {
    const lines = block
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
    const timeLineIdx = lines.findIndex(l => SRT_TIME_RE.test(l));
    if (timeLineIdx === -1) continue;
    const m = lines[timeLineIdx].match(SRT_TIME_RE)!;
    const text = lines.slice(timeLineIdx + 1).join('\n');
    if (!text) continue;
    cues.push({ startMs: srtTimeToMs(m[1], m[2], m[3], m[4]), endMs: srtTimeToMs(m[5], m[6], m[7], m[8]), text });
  }
  return cues;
}

/** Keeps ASR text from being read as ASS override tags. */
function escapeCaptionAssText(text: string): string {
  return text.replace(/\\/g, '＼').replace(/\{/g, '｛').replace(/\}/g, '｝');
}

/** Width of one full-width glyph in px, letter spacing included. */
function cSizeUnits(fontSize: number, preset: CaptionStylePreset): number {
  return fontSize + Math.max(0, preset.charSpacing ?? SUBTITLE_CHAR_SPACING);
}

/** White or near-white stroke: on light backgrounds it needs a dark rim to stay readable. */
function isLightAssColor(color: string | undefined): boolean {
  const m = color?.match(/^&H([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})$/i);
  if (!m) return false;
  const [b, g, r] = [m[2], m[3], m[4]].map(h => Number.parseInt(h, 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 186;
}

/** Dark rim drawn under a light stroke (ASS &HAABBGGRR, ~20% transparent near-black). */
const CAPTION_EDGE_COLOR = '&H33101010';
const CAPTION_EDGE_EXTRA_PX = 2.5;

function usesDarkEdge(preset: CaptionStylePreset): boolean {
  return preset.assLayout !== 'glow_dual' && isLightAssColor(preset.outlineColor);
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
  outlineColor = '&H00000000',
  charSpacing = SUBTITLE_CHAR_SPACING,
): string {
  return `Style: ${name},${fontName},${fontSize},${primaryColor},${primaryColor},${outlineColor},&H00000000,-1,0,0,0,100,100,${charSpacing},0,1,${outlinePx},${shadowPx},2,${SUBTITLE_PADDING_HORIZONTAL},${SUBTITLE_PADDING_HORIZONTAL},0,1\r\n`;
}

/** Top-left disclaimer style (Alignment 7). */
function buildDisclaimerAssStyleLine(fontName: string): string {
  return `Style: Disclaimer,${fontName},${DISCLAIMER_FONT_SIZE},${DISCLAIMER_PRIMARY_COLOR},${DISCLAIMER_PRIMARY_COLOR},&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,${DISCLAIMER_MARGIN_LEFT_PX},0,${DISCLAIMER_MARGIN_TOP_PX},1\r\n`;
}

function formatAssCentiseconds(totalSec: number): string {
  const totalCs = Math.round(totalSec * 100);
  const h = Math.floor(totalCs / 360000);
  const m = Math.floor((totalCs % 360000) / 6000);
  const s = Math.floor((totalCs % 6000) / 100);
  const cs = totalCs % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function escapeDisclaimerAssText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\\/g, '＼')
    .replace(/\{/g, '｛')
    .replace(/\}/g, '｝')
    .replace(/\n/g, '\\N');
}

function buildDisclaimerAssEvent(text: string): string {
  const start = formatAssCentiseconds(0);
  const end = formatAssCentiseconds(DISCLAIMER_DURATION_SEC);
  return `Dialogue: 0,${start},${end},Disclaimer,,0,0,0,,${escapeDisclaimerAssText(text)}\n`;
}

function buildAssStyles(fontName: string, fontSize: number, preset: CaptionStylePreset): string {
  const charSpacing = preset.charSpacing ?? SUBTITLE_CHAR_SPACING;

  if (preset.assLayout === 'glow_dual') {
    const glowColor = preset.glowPrimaryColor ?? '&H00FF6600';
    const glowOutlineColor = preset.glowOutlineColor ?? glowColor;
    const glowPx = preset.glowOutlinePx ?? 10;
    return (
      buildAssStyleLine('Glow', fontName, fontSize, glowColor, glowPx, 0, glowOutlineColor, charSpacing) +
      buildAssStyleLine('Default', fontName, fontSize, preset.primaryColor, preset.outlinePx, 0, '&H00000000', charSpacing)
    );
  }

  if (usesDarkEdge(preset)) {
    // Two layers: a thicker dark stroke underneath, the preset's light stroke on top → light stroke with a dark rim.
    return (
      buildAssStyleLine(
        'Edge',
        fontName,
        fontSize,
        preset.primaryColor,
        preset.outlinePx + CAPTION_EDGE_EXTRA_PX,
        preset.shadowPx,
        CAPTION_EDGE_COLOR,
        charSpacing,
      ) +
      buildAssStyleLine(
        'Default',
        fontName,
        fontSize,
        preset.primaryColor,
        preset.outlinePx,
        0,
        preset.outlineColor ?? '&H00000000',
        charSpacing,
      )
    );
  }

  return buildAssStyleLine(
    'Default',
    fontName,
    fontSize,
    preset.primaryColor,
    preset.outlinePx,
    preset.shadowPx,
    preset.outlineColor ?? '&H00000000',
    charSpacing,
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

  if (usesDarkEdge(preset)) {
    return (
      `Dialogue: 0,${start},${end},Edge,,0,0,${eventMarginV},,${baseText}\n` +
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

  const styleKey = resolveCaptionStyleKey(options.captionStyleKey);
  const preset = getCaptionStylePreset(styleKey);
  const fontFile = options.fontFile;
  const fontExists = fontFile ? fs.existsSync(fontFile) : false;
  const fontName = fontExists ? preset.fontAssName : 'Arial';
  const fontSize = preset.fontSize;
  const disclaimerText = options.disclaimerText?.trim() || DISCLAIMER_TEXT;

  const subtitleBoxHeight = Math.floor(CANVAS_H / 3);
  const marginBottomPx = resolveSubtitleMarginBottomPx(preset.showBackgroundBox);
  const boxMidY = preset.showBackgroundBox
    ? Math.round(CANVAS_H - marginBottomPx - subtitleBoxHeight / 2)
    : Math.round(CANVAS_H - marginBottomPx - fontSize / 2);

  const header = `[Script Info]\r
ScriptType: v4.00+\r
PlayResX: ${CANVAS_W}\r
PlayResY: ${CANVAS_H}\r
WrapStyle: 1\r
\r
[V4+ Styles]\r
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\r
${buildAssStyles(fontName, fontSize, preset)}${options.showDisclaim ? buildDisclaimerAssStyleLine(fontName) : ''}
\r
[Events]\r
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\r
`;

  const maxLineWidth = (CANVAS_W - SUBTITLE_PADDING_HORIZONTAL * 2) / cSizeUnits(fontSize, preset);
  const sourceCues = parseSrtCues(content);
  const cues = options.japaneseStyle
    ? resegmentJapaneseCues(sourceCues, Math.floor(maxLineWidth))
    : sourceCues;

  let events = options.showDisclaim ? buildDisclaimerAssEvent(disclaimerText) : '';
  for (const cue of cues) {
    const start = formatAssCentiseconds(cue.startMs / 1000);
    const end = formatAssCentiseconds(cue.endMs / 1000);
    const wrappedLines = cue.text
      .split('\n')
      .flatMap(line => wrapCaptionText(escapeCaptionAssText(line), maxLineWidth));
    if (!wrappedLines.length) continue;

    const extraGapPx = SUBTITLE_LINE_GAP_PX;
    const lineBreakStr =
      extraGapPx > 0 ? `\\N{\\fs${extraGapPx}}\\h\\N{\\fs${fontSize}}` : '\\N';
    const baseText = wrappedLines.join(lineBreakStr);

    const numLines = wrappedLines.length;
    const totalTextH = numLines * fontSize + Math.max(0, numLines - 1) * SUBTITLE_LINE_GAP_PX;
    const eventMarginV = Math.max(0, Math.round(CANVAS_H - boxMidY - totalTextH / 2));

    events += buildAssEvent(start, end, eventMarginV, baseText, preset);
  }

  fs.writeFileSync(assPath, header + events, 'utf-8');
}
