import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  checkTitleGuards,
  extractCompositionExamples,
  extractSampleTitles,
  findCopiedHookLines,
  findCopiedSample,
  findUnsupportedPromises,
  findUnsupportedStats,
  formatTitleGuardFeedback,
} from './title-guard.js';

const prompt = [
  'K8-P2. Người tốt khi đã nguội lạnh',
  '   Mẫu title (lấy từ video view cao, CHỈ học cấu trúc, không chép): 優しい人が見放したとき、二度と戻らない理由 / 優しい人が冷めると〇〇をやめる',
  'K4-P1. Thang bậc IQ',
  '   Mẫu title (lấy từ video view cao, CHỈ học cấu trúc, không chép): 【IQ70とIQ160】IQが高いと見える世界はどう違うのか？ / 7段階の思考レベル｜あなたはどの階層ですか？',
].join('\n');

describe('title guard', () => {
  test('extracts every sample title', () => {
    assert.deepEqual(extractSampleTitles(prompt), [
      '優しい人が見放したとき、二度と戻らない理由',
      '優しい人が冷めると〇〇をやめる',
      '【IQ70とIQ160】IQが高いと見える世界はどう違うのか？',
      '7段階の思考レベル｜あなたはどの階層ですか？',
    ]);
  });

  test('flags a title that only changes a word or two of a sample', () => {
    const samples = extractSampleTitles(prompt);
    assert.ok(findCopiedSample('優しい人が見放したとき、二度と戻らない理由｜実は「最後の優しさ」だった心理', samples));
    assert.ok(findCopiedSample('優しい人が静かに見放すと、二度と戻らない理由｜限界を迎えた心で起きている4つのこと', samples));
  });

  test('allows titles that only share the topic or a short generic phrase', () => {
    const samples = extractSampleTitles(prompt);
    assert.equal(findCopiedSample('【7段階の思考レベル】本当に頭がいい人と普通の人、見えている世界はどう違うのか？', samples), undefined);
    assert.equal(findCopiedSample('「もう、いいや」怒らない人が最後に選ぶ静かな別れ方｜限界の心で起きる4つのこと', samples), undefined);
  });

  test('does not count overlap made of the video topic words found in the transcript', () => {
    const samples = ['実は1人で旅行できる人ほとんどが…'.padEnd(12, '…')];
    const title = '実は「1人で旅行できる人」はメンタルが強い。周りの目を気にしない人のすごい特徴6選';
    assert.ok(findCopiedSample(title, ['実は、1人で旅行できる人ほとんどが']));
    assert.equal(findCopiedSample(title, ['実は、1人で旅行できる人ほとんどが'], '実は1人で旅行できる人はほとんどが強い'), undefined);
    assert.ok(samples.length);
  });

  test('still flags a near copy whose borrowed words are not in the transcript', () => {
    const samples = extractSampleTitles(prompt);
    const transcript = '優しい人は静かに離れていく。怒りではなく、もう戻らないと決めた心。';
    assert.ok(findCopiedSample('優しい人が静かに見放すと、二度と戻らない理由｜限界の心で起きる4つのこと', samples, transcript));
  });

  test('flags promise words the transcript never uses', () => {
    assert.deepEqual(findUnsupportedPromises('50代から記憶力が復活する習慣7選', 'ノートの取り方を変える'), ['復活']);
    assert.deepEqual(findUnsupportedPromises('50代から記憶力が復活する習慣7選', '記憶力が復活した例'), []);
  });

  test('flags share claims the transcript never states, but not 【】 labels', () => {
    assert.deepEqual(findUnsupportedStats('実は、9割の大人が「3段目」で止まる', '3段目で止まる人が多い'), ['9割']);
    assert.deepEqual(findUnsupportedStats('【※99%が知らない】どうせ人は皆死ぬ', '人は皆死ぬ'), []);
    assert.deepEqual(findUnsupportedStats('実は９割の人が知らない', '調査では9割の人が知らなかった'), []);
    assert.deepEqual(findUnsupportedStats('80%の人がやっている習慣', '80％の人がやっていました'), []);
  });

  test('flags thumbnail lines copied from Composition examples, keeps shared devices', () => {
    const compositionPrompt = [
      prompt,
      '   Composition thumbnail: TOP line = 「優しい人が冷めると」, BOTTOM = 「〇〇をやめる」 or 「二度と戻らない」 in red; last line 「ほとんどが…」 or 「※第1位は意外」.',
    ].join('\n');
    const examples = extractCompositionExamples(compositionPrompt);
    assert.deepEqual(findCopiedHookLines(['優しい人が冷めると', '二度と戻らない'], examples), ['優しい人が冷めると', '二度と戻らない']);
    assert.deepEqual(findCopiedHookLines(['限界を迎えた', 'ほとんどが…', '※第1位は意外'], examples), []);
    // the video itself says it: not a copy
    assert.deepEqual(findCopiedHookLines(['優しい人が冷めると', '※実は論理的'], examples, '優しい人が冷めると人は離れる'), []);
    // a whole thumbnail rebuilt from short example pieces
    const short = extractCompositionExamples('   Composition thumbnail: line 1 「とにかく」, line 2 「どうでもいい」, line 3 「と思いなさい」.');
    assert.deepEqual(findCopiedHookLines(['とにかく', 'どうでもいい', 'と思いなさい'], short, 'どうでもいい'), ['とにかく', 'どうでもいい', 'と思いなさい']);
    const result = checkTitleGuards({
      title: '限界を迎えた優しい人が無言で去る4つのわけ',
      prompt: compositionPrompt,
      transcript: '限界 優しい人 去る',
      hookLines: ['優しい人が冷めると', '※実は論理的な決断'],
    });
    assert.equal(result.ok, false);
    assert.match(result.reasons.join(' '), /hook_lines/);
  });

  test('passes prompts without sample titles untouched', () => {
    assert.deepEqual(checkTitleGuards({ title: '一瞬で変わる', prompt: 'no samples here', transcript: '' }), { ok: true, reasons: [] });
  });

  test('collects reasons and formats feedback for the retry', () => {
    const result = checkTitleGuards({
      title: '優しい人が見放したとき、二度と戻らない理由。一瞬で心が軽くなる',
      prompt,
      transcript: '優しい人は静かに離れていく',
    });
    assert.equal(result.ok, false);
    assert.equal(result.reasons.length, 2);
    assert.match(formatTitleGuardFeedback(result.reasons), /LẦN TRẢ LỜI TRƯỚC BỊ LOẠI/);
  });
});
