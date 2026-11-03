import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  findMascotScenePromptIssue,
  parseMascotProfile,
  scenePromptShowsMascot,
} from './ai-video-mascot-profile.js';

describe('parseMascotProfile', () => {
  test('maps snake_case fields, flattens lines and caps lists', () => {
    const profile = parseMascotProfile(
      JSON.stringify({
        identity_phrase: 'the round white doodle mascot\nwith dot eyes',
        style_rule: ' thick black outline, flat white fill ',
        expressions: [
          { emotion: 'angry', look: 'slanted brows, open red mouth' },
          { emotion: 'no look' },
        ],
        poses: ['arms crossed', '', 'sitting hugging knees', ...Array.from({ length: 20 }, (_, i) => `pose ${i}`)],
        effects: ['yellow emphasis lines'],
        avoid: ['fingers'],
        supporting_cast_rule: 'same species, one accessory',
      }),
    );

    assert.equal(profile.identityPhrase, 'the round white doodle mascot with dot eyes');
    assert.equal(profile.styleRule, 'thick black outline, flat white fill');
    assert.deepEqual(profile.expressions, [{ emotion: 'angry', look: 'slanted brows, open red mouth' }]);
    assert.equal(profile.poses.length, 12);
    assert.equal(profile.poses[1], 'sitting hugging knees');
    assert.equal(profile.supportingCastRule, 'same species, one accessory');
  });

  test('adds the mascot keyword when the identity phrase lacks it', () => {
    const profile = parseMascotProfile('{"identity_phrase":"a round white doodle","style_rule":"flat"}');
    assert.equal(profile.identityPhrase, 'a round white doodle (the mascot)');
    assert.ok(profile.supportingCastRule.length > 0);
  });

  test('rejects unusable answers', () => {
    assert.throws(() => parseMascotProfile('nope'), /not valid JSON/);
    assert.throws(() => parseMascotProfile('[]'), /JSON object/);
    assert.throws(() => parseMascotProfile('{"style_rule":"x"}'), /identity_phrase/);
    assert.throws(() => parseMascotProfile('{"identity_phrase":"the mascot"}'), /style_rule/);
  });
});

describe('scene prompt checks', () => {
  const mascot = (text: string) => ({ prompt: `the round white doodle mascot, ${text}` });
  const plain = (text: string) => ({ prompt: text });

  test('scenePromptShowsMascot matches the keyword as a word', () => {
    assert.equal(scenePromptShowsMascot('The Mascot sits down'), true);
    assert.equal(scenePromptShowsMascot('mascots everywhere'), false);
  });

  test('accepts chunks where most scenes show the mascot', () => {
    assert.equal(findMascotScenePromptIssue([mascot('a'), mascot('b'), plain('an hourglass'), mascot('c')]), null);
    assert.equal(findMascotScenePromptIssue([plain('a lone hourglass')]), null);
    assert.equal(findMascotScenePromptIssue([]), null);
  });

  test('flags chunks without the mascot, with too few mascot scenes or with off-style words', () => {
    assert.match(findMascotScenePromptIssue([plain('a'), plain('b')]) ?? '', /no scene shows the mascot \(0\/2\)/);
    assert.match(
      findMascotScenePromptIssue([mascot('a'), plain('b'), plain('c'), plain('d')]) ?? '',
      /only 1\/4 scenes/,
    );
    assert.match(findMascotScenePromptIssue([mascot('photorealistic kitchen')]) ?? '', /off-style.*photorealistic/);
    assert.match(findMascotScenePromptIssue([mascot('a'), mascot('b, 8k')]) ?? '', /"8k"/);
    assert.match(findMascotScenePromptIssue([plain('an elderly man crying')]) ?? '', /shows a "man" but not the mascot/);
    assert.equal(findMascotScenePromptIssue([mascot('hugging a grandmother doodle character')]), null);
  });

  test('ignores title cards', () => {
    assert.equal(findMascotScenePromptIssue([{ type: 'title', prompt: '' }, mascot('a'), plain('b')]), null);
  });
});
