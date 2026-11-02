import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

let dataDir = '';
let mod: typeof import('./run-mascot-thumbnail.js');

before(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dammo-mascot-thumb-'));
  process.env.DATA_DIR = dataDir;
  mod = await import('./run-mascot-thumbnail.js');
});

after(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe('parseMascotThumbnailConcepts', () => {
  test('maps snake_case fields, drops candidates without a prompt and caps at count', () => {
    const json = JSON.stringify({
      candidates: [
        { angle: 'curiosity', hook_lines: ['学校から', ' 人が ', ''], emphasis: '人が', mascot_pose: 'sitting', composition: 'text left', prompt: 'p1' },
        { angle: 'no prompt', hook_lines: ['x'] },
        { angle: 'warning', hook_lines: ['夜12時'], prompt: 'p2' },
        { angle: 'extra', prompt: 'p3' },
      ],
    });

    const concepts = mod.parseMascotThumbnailConcepts(json, 2);

    assert.equal(concepts.length, 2);
    assert.deepEqual(concepts[0], {
      angle: 'curiosity',
      hookLines: ['学校から', '人が'],
      emphasis: '人が',
      mascotPose: 'sitting',
      composition: 'text left',
      prompt: 'p1',
    });
    assert.equal(concepts[1]?.prompt, 'p2');
    assert.deepEqual(concepts[1]?.hookLines, ['夜12時']);
  });

  test('accepts a bare array', () => {
    assert.equal(mod.parseMascotThumbnailConcepts('[{"prompt":"only"}]', 3)[0]?.prompt, 'only');
  });

  test('rejects unusable responses', () => {
    assert.throws(() => mod.parseMascotThumbnailConcepts('not json', 3), /not valid JSON/);
    assert.throws(() => mod.parseMascotThumbnailConcepts('{"items":[]}', 3), /candidates/);
    assert.throws(() => mod.parseMascotThumbnailConcepts('{"candidates":[{"angle":"a"}]}', 3), /no candidate/);
  });
});

describe('thumbnail candidates file', () => {
  test('round-trips through thumbnail-candidates/candidates.json', async () => {
    const workDir = path.join(dataDir, 'video');
    assert.equal(await mod.readMascotThumbnailCandidatesFile(workDir), null);

    const file = {
      generatedAt: '2026-11-02T00:00:00.000Z',
      selectedFile: 'candidate-2.jpg',
      candidates: [
        { angle: 'a', hookLines: [], emphasis: '', mascotPose: '', composition: '', prompt: 'p', error: 'failed' },
        { angle: 'b', hookLines: ['x'], emphasis: 'x', mascotPose: '', composition: '', prompt: 'q', file: 'candidate-2.jpg' },
      ],
    };
    await mod.writeMascotThumbnailCandidatesFile(workDir, file);

    assert.deepEqual(await mod.readMascotThumbnailCandidatesFile(workDir), file);
    assert.equal(mod.resolveThumbnailCandidatesDir(workDir), path.join(workDir, 'thumbnail-candidates'));
  });
});

describe('thumbnail judge', () => {
  const concept = { angle: '', hookLines: [], emphasis: '', mascotPose: '', composition: '', prompt: 'p' };

  test('parses verdicts by candidate number, clamps scores and computes the weighted score', () => {
    const json = JSON.stringify({
      results: [
        { candidate: 2, text_correct: false, text_issues: '脳 → 悩', mascot_match: 9, readability: 8, curiosity: 7, title_fit: 6, reason: 'r2' },
        { candidate: 1, text_correct: true, mascot_match: 12, readability: '5', curiosity: -1, title_fit: 10 },
        { candidate: 9, text_correct: true },
      ],
    });

    const verdicts = mod.parseMascotThumbnailJudgements(json, 2);

    assert.equal(verdicts.size, 2);
    assert.deepEqual(verdicts.get(1), {
      textCorrect: true,
      textIssues: '',
      mascotMatch: 10,
      readability: 5,
      curiosity: 0,
      titleFit: 10,
      score: 6,
      reason: '',
    });
    assert.equal(verdicts.get(2)?.textCorrect, false);
    assert.equal(verdicts.get(2)?.textIssues, '脳 → 悩');
    // 9*0.3 + 8*0.3 + 7*0.25 + 6*0.15 = 7.75 → one decimal
    assert.equal(verdicts.get(2)?.score, 7.8);
  });

  test('requires a verdict for every candidate', () => {
    assert.throws(
      () => mod.parseMascotThumbnailJudgements('{"results":[{"candidate":1}]}', 2),
      /scored 1 of 2/,
    );
  });

  test('picks correct text over a higher score, then the best score, skipping failed draws', () => {
    const judged = (file: string, textCorrect: boolean, score: number) => ({
      ...concept,
      file,
      judgement: { textCorrect, textIssues: '', mascotMatch: 0, readability: 0, curiosity: 0, titleFit: 0, score, reason: '' },
    });

    assert.equal(
      mod.pickBestMascotThumbnailCandidate([
        { ...concept, error: 'failed' },
        judged('candidate-2.jpg', false, 9.5),
        judged('candidate-3.jpg', true, 6),
        judged('candidate-4.jpg', true, 7.2),
      ])?.file,
      'candidate-4.jpg',
    );
    assert.equal(
      mod.pickBestMascotThumbnailCandidate([judged('candidate-1.jpg', false, 5), judged('candidate-2.jpg', false, 8)])?.file,
      'candidate-2.jpg',
    );
    assert.equal(
      mod.pickBestMascotThumbnailCandidate([{ ...concept, file: 'candidate-1.jpg' }, { ...concept, file: 'candidate-2.jpg' }])?.file,
      'candidate-1.jpg',
    );
    assert.equal(mod.pickBestMascotThumbnailCandidate([{ ...concept, error: 'x' }]), undefined);
  });
});
