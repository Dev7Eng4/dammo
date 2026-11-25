import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { applyNarrationReadings, findRiskyTerms } from '../voice/narration-readings.js';
import { captionCueTimes, splitCaption } from './narration.js';
import { subtitleTimeMap } from './scene-retime.js';

describe('splitCaption', () => {
  test('keeps lines within 28 characters, also without 、', () => {
    const sentence = 'コーネル大学の心理学者トーマス・ギロビッチさんと共同研究者たちが行った有名な実験があります。';
    const lines = splitCaption(sentence);
    assert.ok(lines.length >= 2);
    assert.ok(lines.every(line => Array.from(line).length <= 28), lines.join(' | '));
    assert.equal(lines.join(''), sentence);
  });

  test('does not leave a short lead-in on its own line', () => {
    const lines = splitCaption('最後に、今日からひとつだけ試していただきたい小さな習慣があります。');
    assert.ok(lines.every(line => Array.from(line).length > 6), lines.join(' | '));
  });
});

describe('captionCueTimes', () => {
  const sentence = 'たとえば朝の散歩をしているとき、ふと昔のことを思い出して、胸が少し温かくなることはありませんか。';
  const lines = splitCaption(sentence);

  test('with engine timing, a line after 、 starts when speech resumes after that pause', () => {
    assert.equal(lines.length, 3, lines.join(' | '));
    const timing = {
      totalSec: 6,
      speechStartSec: 0.1,
      speechEndSec: 5,
      pauses: [
        { startSec: 1.8, endSec: 2.1 },
        { startSec: 3.4, endSec: 3.7 },
      ],
    };
    // The real WAV is a little longer than the model (frame rounding): everything scales by 6.6 / 6.
    const cues = captionCueTimes(sentence, lines, 6.6, 1, timing);
    assert.ok(Math.abs(cues[1][0] - timing.pauses[0].endSec * 1.1) < 1e-9, String(cues[1][0]));
    assert.ok(Math.abs(cues[2][0] - timing.pauses[1].endSec * 1.1) < 1e-9, String(cues[2][0]));
    assert.ok(Math.abs(cues[0][0] - 0.11) < 1e-9);
    // The last line holds a little into the pause after the sentence.
    assert.ok(cues[2][1] > timing.speechEndSec * 1.1 && cues[2][1] <= 6.6);
  });

  test('without timing, falls back to estimated moras and keeps cues ordered', () => {
    const cues = captionCueTimes(sentence, lines, 6, 1);
    assert.equal(cues.length, lines.length);
    for (let i = 1; i < cues.length; i++) assert.ok(cues[i][0] >= cues[i - 1][0]);
    assert.ok(cues[0][1] > cues[0][0]);
  });

  test('a very short line borrows time from the next one', () => {
    const cues = captionCueTimes('けれど、それだけではありませんでした。ずっと前から感じていたことです。', ['けれど、', 'それだけではありませんでした。ずっと前から感じていたことです。'], 6, 1, {
      totalSec: 6,
      speechStartSec: 0,
      speechEndSec: 5,
      pauses: [
        { startSec: 0.4, endSec: 0.6 },
        { startSec: 2.5, endSec: 2.9 },
      ],
    });
    assert.ok(cues[0][1] - cues[0][0] >= 0.99, String(cues[0][1] - cues[0][0]));
  });
});

describe('narration readings', () => {
  const entries = [
    { surface: '誠さん', reading: 'マコトサン', addedAt: '' },
    { surface: '誠', reading: 'マコト', addedAt: '' },
  ];

  test('longest word wins and the rest of the text is unchanged', () => {
    assert.equal(applyNarrationReadings('誠さんは誠実な人です。', entries.slice(0, 1)), 'マコトサンは誠実な人です。');
    assert.equal(applyNarrationReadings('誠さんと誠。', entries), 'マコトサンとマコト。');
  });

  test('flags numbers, names and Latin words not in the dictionary', () => {
    const terms = findRiskyTerms('二〇〇三年、恵子さんはNHKで50代の3割と話しました。', []);
    const texts = terms.map(term => term.text);
    assert.ok(texts.includes('二〇〇三年'), texts.join(','));
    assert.ok(texts.includes('恵子'), texts.join(','));
    assert.ok(texts.includes('NHK'), texts.join(','));
    assert.ok(texts.includes('50代'), texts.join(','));
    assert.deepEqual(findRiskyTerms('一人で十分です。', []), []);
    assert.deepEqual(findRiskyTerms('誠さんが来ました。', entries), []);
  });
});

describe('subtitleTimeMap', () => {
  const srt = (cues: Array<[number, number, string]>) =>
    cues
      .map(([start, end, text], index) => {
        const t = (ms: number) => new Date(ms).toISOString().slice(11, 23).replace('.', ',');
        return `${index + 1}\n${t(start)} --> ${t(end)}\n${text}\n`;
      })
      .join('\n');

  test('same sentences split into different cues still map sentence by sentence', () => {
    const from = srt([
      [0, 1000, 'はじめに、'],
      [1000, 3000, '今日の話をします。'],
      [4000, 6000, '次の話です。'],
    ]);
    const to = srt([
      [0, 4000, 'はじめに、今日の話をします。'],
      [5000, 9000, '次の話です。'],
    ]);
    const { map, matchedRatio } = subtitleTimeMap(from, to);
    assert.equal(matchedRatio, 1);
    assert.equal(map(4000), 5000);
    assert.equal(map(6000), 9000);
  });

  test('a new script shares few sentences', () => {
    const from = srt([
      [0, 2000, '古い文です。'],
      [2000, 4000, '別の文です。'],
    ]);
    const to = srt([
      [0, 3000, '新しい文です。'],
      [3000, 8000, '全く違う文です。'],
    ]);
    const { map, matchedRatio } = subtitleTimeMap(from, to);
    assert.equal(matchedRatio, 0);
    assert.equal(map(4000), 8000);
  });
});
