import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { paths } from '../../../../config/paths.js';
import { runFfmpeg } from '../../../../infrastructure/ffmpeg/ffmpeg-runner.js';
import { parseSrt, serializeSrt, srtTimestampToMs } from '../../../../infrastructure/subtitle/srt-utils.js';
import { getCaptionStylePreset } from '../render-core/caption-styles.js';
import { CANVAS_H, CANVAS_W } from '../render-core/canvas.constants.js';
import { escapePathForFfmpegSubtitles } from '../render-core/subtitle.js';
import type { AiVideoScenePrompt } from './ai-video.types.js';

const TITLE_CARD_FONT_REL_PATH = 'fonts/NotoSerifJP-SemiBold.ttf';
const TITLE_CARD_FONT_ASS_NAME = 'Noto Serif JP';
const TITLE_CARD_BACKGROUND = '0x23262b';
/** ASS colours are &HAABBGGRR. */
const TITLE_CARD_TEXT_COLOR = '&H00E8F1F6';
const TITLE_CARD_SHADOW_COLOR = '&H96000000';
const TITLE_CARD_RULE_COLOR = '&H7FA8C9&';
const TITLE_CARD_RULE_WIDTH = 160;
const TITLE_CARD_RULE_GAP = 36;

/** Font size + max line width (in full-width character units) tried in order until the title fits. */
const TITLE_CARD_LAYOUTS = [
  { fontSize: 64, maxLineUnits: 15, maxLines: 2 },
  { fontSize: 52, maxLineUnits: 19, maxLines: 3 },
  { fontSize: 44, maxLineUnits: 22, maxLines: Number.POSITIVE_INFINITY },
] as const;

const BREAK_AFTER = new Set(Array.from('、。，．,.：:；;！？!?」』）)】〕・ '));
const NO_LINE_START = new Set(Array.from('、。，．,.：:；;！？!?」』）)】〕ー'));

export function isTitleScene(scene: Pick<AiVideoScenePrompt, 'type'>): boolean {
  return scene.type === 'title';
}

export interface TitleCardRange {
  startSec: number;
  endSec: number;
}

/** Time ranges of title scenes that have a rendered card (scenes must already be scaled by audio speed). */
export function resolveTitleCardRanges(scenes: AiVideoScenePrompt[]): TitleCardRange[] {
  return scenes
    .filter(scene => isTitleScene(scene) && Boolean(scene.path?.trim()))
    .map(scene => ({
      startSec: srtTimestampToMs(scene.startTime) / 1_000,
      endSec: srtTimestampToMs(scene.endTime) / 1_000,
    }))
    .filter(range => range.endSec > range.startSec);
}

/** Drop caption cues whose midpoint falls on a title card, so the heading is not shown twice. */
export function stripSrtCuesOnTitleCards(srtContent: string, ranges: TitleCardRange[]): string {
  const kept = parseSrt(srtContent).filter(block => {
    const midSec = (srtTimestampToMs(block.start) + srtTimestampToMs(block.end)) / 2_000;
    return !ranges.some(range => midSec >= range.startSec && midSec <= range.endSec);
  });
  return serializeSrt(kept.map((block, index) => ({ ...block, index: index + 1 })));
}

/** ffmpeg timeline expression that is true outside every title card (for `enable=`). */
export function buildOutsideTitleCardsExpr(ranges: TitleCardRange[]): string {
  const inside = ranges.map(range => `between(t,${range.startSec.toFixed(3)},${range.endSec.toFixed(3)})`);
  return `not(${inside.join('+')})`;
}

function charUnits(char: string): number {
  return (char.codePointAt(0) ?? 0) >= 0x1100 ? 1 : 0.55;
}

/** Break a heading into lines no wider than `maxUnits`, preferring breaks after punctuation or spaces. */
export function wrapTitleLines(title: string, maxUnits: number): string[] {
  const lines: string[] = [];

  for (const paragraph of title.split(/\r?\n/)) {
    let chars = Array.from(paragraph.trim());
    while (chars.length > 0) {
      let width = 0;
      let cut = chars.length;
      let lastBreak = -1;
      for (let index = 0; index < chars.length; index += 1) {
        width += charUnits(chars[index]!);
        if (width > maxUnits) {
          cut = index;
          break;
        }
        if (BREAK_AFTER.has(chars[index]!)) lastBreak = index + 1;
      }
      if (cut < chars.length && lastBreak >= Math.ceil(cut / 2)) cut = lastBreak;
      while (cut < chars.length && NO_LINE_START.has(chars[cut]!)) cut += 1;
      cut = Math.max(1, cut);

      const line = chars.slice(0, cut).join('').trim();
      if (line) lines.push(line);
      chars = chars.slice(cut);
      while (chars[0] === ' ') chars.shift();
    }
  }

  return lines;
}

function escapeAssText(text: string): string {
  return text.replace(/\\/g, '＼').replace(/\{/g, '｛').replace(/\}/g, '｝');
}

function resolveTitleCardFont(): { fontPath: string; fontName: string } {
  const titleFontPath = path.join(paths.reupSiAssetsDir, TITLE_CARD_FONT_REL_PATH);
  if (fs.existsSync(titleFontPath)) {
    return { fontPath: titleFontPath, fontName: TITLE_CARD_FONT_ASS_NAME };
  }
  const preset = getCaptionStylePreset('default');
  return { fontPath: path.join(paths.reupSiAssetsDir, preset.fontRelPath), fontName: preset.fontAssName };
}

/** ASS script that draws the centred heading between two short accent rules. */
export function buildTitleCardAss(title: string, fontName: string): string {
  const layout =
    TITLE_CARD_LAYOUTS.find(item => wrapTitleLines(title, item.maxLineUnits).length <= item.maxLines) ??
    TITLE_CARD_LAYOUTS[TITLE_CARD_LAYOUTS.length - 1];
  const lines = wrapTitleLines(title, layout.maxLineUnits);
  const centerX = Math.round(CANVAS_W / 2);
  const centerY = Math.round(CANVAS_H / 2);
  const blockHalf = Math.round((lines.length * layout.fontSize * 1.3) / 2);
  const ruleOffsets = [-(blockHalf + TITLE_CARD_RULE_GAP), blockHalf + TITLE_CARD_RULE_GAP];
  const rule = `m 0 0 l ${TITLE_CARD_RULE_WIDTH} 0 l ${TITLE_CARD_RULE_WIDTH} 2 l 0 2`;

  const events = [
    `Dialogue: 1,0:00:00.00,0:00:10.00,Title,,0,0,0,,{\\an5\\pos(${centerX},${centerY})}${lines.map(escapeAssText).join('\\N')}`,
    ...ruleOffsets.map(
      offset =>
        `Dialogue: 0,0:00:00.00,0:00:10.00,Title,,0,0,0,,` +
        `{\\an5\\pos(${centerX},${centerY + offset})\\p1\\bord0\\shad0\\1c${TITLE_CARD_RULE_COLOR}}${rule}{\\p0}`,
    ),
  ];

  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${CANVAS_W}`,
    `PlayResY: ${CANVAS_H}`,
    'WrapStyle: 2',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Title,${fontName},${layout.fontSize},${TITLE_CARD_TEXT_COLOR},${TITLE_CARD_TEXT_COLOR},&H00000000,${TITLE_CARD_SHADOW_COLOR},0,0,0,0,100,100,4,0,1,0,3,5,0,0,0,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events,
    '',
  ].join('\r\n');
}

/** Render a heading as a full-canvas JPEG (dark background, centred text). No AI involved. */
export async function renderTitleCardImage(
  title: string,
  outputPath: string,
  onLog?: (msg: string) => void,
): Promise<void> {
  const { fontPath, fontName } = resolveTitleCardFont();
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  const assPath = path.join(path.dirname(outputPath), `.${path.basename(outputPath, path.extname(outputPath))}.title.ass`);
  await fsp.writeFile(assPath, buildTitleCardAss(title, fontName), 'utf8');

  const assEscaped = escapePathForFfmpegSubtitles(assPath);
  const fontsDirEscaped = escapePathForFfmpegSubtitles(path.dirname(fontPath));
  try {
    await runFfmpeg(
      [
        '-y',
        '-f', 'lavfi',
        '-i', `color=c=${TITLE_CARD_BACKGROUND}:s=${CANVAS_W}x${CANVAS_H}:d=1`,
        '-vf', `vignette=angle=PI/4,subtitles='${assEscaped}:fontsdir=${fontsDirEscaped}'`,
        '-frames:v', '1',
        '-q:v', '2',
        outputPath,
      ],
      { onLog, label: 'title-card', encoderFallback: false },
    );
  } finally {
    await fsp.rm(assPath, { force: true });
  }
}
