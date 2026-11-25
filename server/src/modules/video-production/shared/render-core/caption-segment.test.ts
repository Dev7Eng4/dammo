import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { type CaptionCue, resegmentJapaneseCues, splitCaptionSentence, wrapCaptionText } from './caption-segment.js';

const cue = (startMs: number, endMs: number, text: string): CaptionCue => ({ startMs, endMs, text });

describe('resegmentJapaneseCues', () => {
  test('re-joins words that ASR cut across cues', () => {
    const out = resegmentJapaneseCues(
      [
        cue(80, 4262, '仕事から帰って玄関のドアを開けた時、皆'),
        cue(4262, 7480, 'さんの目の前にはどのような光景が広がっ'),
        cue(7480, 9945, 'ていますか?'),
      ],
      21,
    );
    const texts = out.map(c => c.text);
    assert.equal(texts.join(''), '仕事から帰って玄関のドアを開けた時、皆さんの目の前にはどのような光景が広がっていますか?');
    assert.ok(texts.every(t => Array.from(t).length <= 21), texts.join(' | '));
    assert.ok(!texts.some(t => t.endsWith('皆') || t.startsWith('さん')), texts.join(' | '));
    assert.ok(!texts.some(t => t.startsWith('ていますか')), texts.join(' | '));
    assert.equal(out[0].startMs, 80);
    assert.equal(Math.round(out.at(-1)!.endMs), 9945);
  });

  test('a cue never spans two sentences and keeps the orphan tail with its sentence', () => {
    const out = resegmentJapaneseCues(
      [
        cue(0, 3000, 'そして足の踏み場もないほど散らかった物'),
        cue(3000, 5000, 'たち。ああ、明日は絶対に片付けよう'),
        cue(5000, 9000, 'と思いながらため息をついてはいませんか?'),
      ],
      21,
    );
    const texts = out.map(c => c.text);
    // 22 characters: cut at a natural point, and `たち。` stays attached rather than alone.
    assert.deepEqual(texts.slice(0, 2), ['そして足の踏み場もないほど', '散らかった物たち。']);
    assert.ok(texts.slice(2).every(t => t.startsWith('ああ') || !t.includes('たち。')), texts.join(' | '));
    assert.ok(!texts.some(t => t.includes('。ああ')), texts.join(' | '));
  });

  test('times stay ordered and inside the source span', () => {
    const src = [cue(0, 2000, 'ところが不思議な人たちがいます。いつ'), cue(2000, 5000, '見ても部屋が綺麗な人たちです。')];
    const out = resegmentJapaneseCues(src, 21);
    for (let i = 0; i < out.length; i++) {
      assert.ok(out[i].startMs < out[i].endMs);
      if (i) assert.ok(out[i].startMs >= out[i - 1].endMs - 1);
    }
    assert.equal(out[0].text, 'ところが不思議な人たちがいます。');
    assert.equal(out[1].text, 'いつ見ても部屋が綺麗な人たちです。');
  });

  test('does not bridge a long pause', () => {
    const out = resegmentJapaneseCues([cue(0, 1500, '最初の部分'), cue(4000, 5500, '次の部分')], 21);
    assert.deepEqual(
      out.map(c => c.text),
      ['最初の部分', '次の部分'],
    );
  });
});

describe('splitCaptionSentence', () => {
  test('prefers clause marks and keeps lines within the limit', () => {
    const lines = splitCaptionSentence('ソファーの上に脱ぎ捨てられた服、テーブルの上に積み上げられた正体不明の郵便物、', 21);
    assert.ok(lines.every(l => Array.from(l).length <= 21), lines.join(' | '));
    assert.equal(lines[0], 'ソファーの上に脱ぎ捨てられた服、');
  });

  test('never starts a line with small kana or punctuation', () => {
    const lines = splitCaptionSentence('彼らが私たちより特別に秀でているからではありませんでしたっ', 12);
    for (const line of lines.slice(1)) assert.ok(!/^[、。っゃゅょー]/.test(line), lines.join(' | '));
  });
});

describe('wrapCaptionText', () => {
  test('balances Japanese lines instead of leaving 1–2 stray characters', () => {
    // 23 characters at 21 per line: the old wrap left `で` (2 chars) alone on line 2.
    const lines = wrapCaptionText('のは彼らが私たちより特別に秀でているからです', 21);
    assert.equal(lines.length, 2);
    assert.ok(Math.abs(Array.from(lines[0]).length - Array.from(lines[1]).length) <= 4, lines.join(' | '));
  });

  test('wraps Latin text between words only', () => {
    const lines = wrapCaptionText('La soledad no es un castigo, es una oportunidad para conocerte mejor cada día', 21);
    assert.ok(lines.length >= 2);
    assert.equal(lines.join(' '), 'La soledad no es un castigo, es una oportunidad para conocerte mejor cada día');
  });
});
