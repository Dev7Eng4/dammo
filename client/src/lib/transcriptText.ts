import type { ProductionTranscriptCue } from '../types/videoProductionScenes';

const CJK_CHAR = /[　-ヿ㐀-鿿豈-﫿＀-￯]/;

/**
 * SRT cues cut sentences mid-word, so join them back into running text without timestamps:
 * CJK cues are glued directly, others get a space, and a line break follows each sentence end.
 */
export function cuesToPlainText(cues: ProductionTranscriptCue[]): string {
  let text = '';
  for (const cue of cues) {
    const part = cue.text.replace(/\s*\n\s*/g, ' ').trim();
    if (!part) continue;
    const prev = text.at(-1);
    const glue = !prev || prev === '\n' || (CJK_CHAR.test(prev) && CJK_CHAR.test(part[0])) ? '' : ' ';
    text += glue + part;
  }
  return text.replace(/([。！？!?])\s*/g, '$1\n').trim();
}
