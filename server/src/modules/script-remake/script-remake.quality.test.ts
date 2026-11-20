import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { chapterProblems, sourceCopiedSentences } from './script-remake.quality.js';

const SOURCE =
  '実験では学生たちに少し恥ずかしい絵柄のシャツを着せて、大勢のいる部屋に入ってもらいました。' +
  '週末に孫が遊びに来たんですよ、と声をかけられたとしましょう。';

describe('source copy check', () => {
  test('flags sentences that reuse 15+ characters of the reference wording, ignoring punctuation', () => {
    const copied = '実験では、学生たちに少し恥ずかしい絵柄のシャツを着せました。';
    const own = 'コーネル大学の研究では、目立つ人物の顔が描かれた服を着た学生が教室に入りました。';
    assert.deepEqual(sourceCopiedSentences([copied, own], SOURCE), [copied]);
  });

  test('short shared phrases are not copying', () => {
    // 「週末に孫が遊びに来た」 is 10 characters: too short to count.
    assert.deepEqual(sourceCopiedSentences(['先週末に孫が遊びに来たという田中さん。'], SOURCE), []);
  });

  test('chapterProblems reports copied sentences only when a source is given', () => {
    const sentences = ['実験では学生たちに少し恥ずかしい絵柄のシャツを着せて部屋に入ってもらいます。'];
    const base = { sentences, previous: [], targetChars: sentences[0]!.length };
    assert.equal(chapterProblems(base).some(p => p.includes('参考動画')), false);
    const withSource = chapterProblems({ ...base, source: SOURCE });
    assert.equal(withSource.filter(p => p.includes('参考動画')).length, 1);
    assert.match(withSource.find(p => p.includes('参考動画'))!, /1文ある/);
  });
});
