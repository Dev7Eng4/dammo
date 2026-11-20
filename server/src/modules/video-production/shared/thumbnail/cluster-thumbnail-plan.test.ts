import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseMetadataResponse } from '../meta/meta-response.js';
import { toVideoMetaOutput } from '../meta/run-metadata.js';
import { buildRecentFormatsHint } from '../meta/cluster-format-history.js';
import { describeClusterThumbnailPlan } from './cluster-thumbnail-plan.js';

/** A response in the shape the cluster meta prompts (data/prompts/ja/metadata_tlnb_k*) ask for. */
const clusterResponse = {
  detected_niche: 'Ranh giới quan hệ',
  cluster_format: { format: 'K8-A', cluster_role: 'main', reason: 'Nội dung nói hành vi khiến người khác rời xa.' },
  metadata: {
    title: '【心理学】こんな人から、人は静かに離れていく',
    description: '説明文。',
    tags: ['心理学', '人間関係', '距離を置く', '優しい人', '境界線'],
  },
  alternative_titles: ['優しい人が黙って去る前に見せるサイン', '身近な人にほどキツく当たる人の正体'],
  thumbnail: {
    format: 'K8-A',
    format_name: 'Hệ quả trong quan hệ',
    look: 'Cool dusk tones, key word in red #E0322B, no boxes.',
    composition: 'The mascot in the foreground realising a consequence; gray silhouettes walking away.',
    rules: 'Mascot được phép lo lắng rõ.',
    hook_lines: ['気づけば', '誰もいない'],
    emphasis: '誰もいない',
    scene: 'apartment hallway at dusk',
    mascot_pose: 'glancing back, uneasy',
    prompt: 'A YouTube thumbnail ...',
  },
  video_visual_prompt: 'A quiet hallway at dusk, no text.',
};

function response(json: unknown) {
  return { provider: 'gemini', content: JSON.stringify(json), codeBlocks: [], elapsedMs: 0 } as never;
}

describe('cluster meta response', () => {
  test('parses with the niche schema and keeps the format choice and thumbnail plan', () => {
    const result = parseMetadataResponse(response(clusterResponse), { niche: 'ja-psy-k8' });
    assert.ok(result.ok, result.ok ? '' : result.reason);
    const meta = toVideoMetaOutput(result.value, 'source');
    assert.equal(meta.cluster_format?.format, 'K8-A');
    assert.equal(meta.image_generation_prompt, 'A YouTube thumbnail ...');

    const brief = describeClusterThumbnailPlan(meta);
    assert.match(brief, /Format: K8-A — Hệ quả trong quan hệ/);
    assert.match(brief, /#E0322B/);
    assert.match(brief, /気づけば \/ 誰もいない/);
  });

  test('no format block for metadata without a cluster plan', () => {
    const result = parseMetadataResponse(
      response({ ...clusterResponse, cluster_format: undefined, thumbnail: { prompt: 'x' } }),
      { niche: 'ja-psy-k8' },
    );
    assert.ok(result.ok);
    assert.equal(describeClusterThumbnailPlan(toVideoMetaOutput(result.value, 'source')), '');
  });
});

describe('buildRecentFormatsHint', () => {
  test('empty without history, lists formats otherwise', () => {
    assert.equal(buildRecentFormatsHint([]), '');
    assert.match(buildRecentFormatsHint(['K8-A', 'K8-B']), /K8-A, K8-B/);
  });
});
