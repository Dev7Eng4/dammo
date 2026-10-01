import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  classifyMetaImageUrl,
  collectImageUrlCandidates,
  isBlobUrl,
  isHttpUrl,
  isIgnoredImageUrl,
  parseSrcsetUrls,
  pickBestMetaImageUrl,
  pickBestMetaImageUrlFromInputs,
  scoreMetaImageUrl,
} from './meta-image-url.js';

const FBCDN_URL =
  'https://scontent.xx.fbcdn.net/v/t39.105495-1/788019520_1626258532277052_8483277982140937533_n.webp?_nc_ht=scontent.xx.fbcdn.net';
const BLOB_URL = 'blob:https://www.meta.ai/abc-123-def';

describe('isHttpUrl / isBlobUrl', () => {
  test('detects http(s) URLs', () => {
    assert.equal(isHttpUrl(FBCDN_URL), true);
    assert.equal(isHttpUrl('http://example.com/a.jpg'), true);
    assert.equal(isHttpUrl(BLOB_URL), false);
  });

  test('detects blob URLs', () => {
    assert.equal(isBlobUrl(BLOB_URL), true);
    assert.equal(isBlobUrl(FBCDN_URL), false);
  });
});

describe('isIgnoredImageUrl', () => {
  test('ignores empty and favicon URLs', () => {
    assert.equal(isIgnoredImageUrl(''), true);
    assert.equal(isIgnoredImageUrl('https://meta.ai/favicon.ico'), true);
    assert.equal(isIgnoredImageUrl(FBCDN_URL), false);
  });
});

describe('classifyMetaImageUrl', () => {
  test('classifies supported URL kinds', () => {
    assert.equal(classifyMetaImageUrl(FBCDN_URL), 'http');
    assert.equal(classifyMetaImageUrl(BLOB_URL), 'blob');
    assert.equal(classifyMetaImageUrl('data:image/png;base64,abc'), 'data');
    assert.equal(classifyMetaImageUrl(''), 'unsupported');
  });
});

describe('parseSrcsetUrls', () => {
  test('returns URLs ordered by width descending', () => {
    const srcset = [
      `${FBCDN_URL}&w=640 640w`,
      'https://example.com/large.jpg 1280w',
      'https://example.com/small.jpg 320w',
    ].join(', ');

    assert.deepEqual(parseSrcsetUrls(srcset), [
      'https://example.com/large.jpg',
      `${FBCDN_URL}&w=640`,
      'https://example.com/small.jpg',
    ]);
  });
});

describe('collectImageUrlCandidates', () => {
  test('collects src and srcset without duplicates', () => {
    const candidates = collectImageUrlCandidates(
      BLOB_URL,
      `${FBCDN_URL} 1280w, ${FBCDN_URL} 640w`,
    );

    assert.equal(candidates.length, 2);
    assert.deepEqual(
      candidates.map(candidate => candidate.url),
      [BLOB_URL, FBCDN_URL],
    );
  });

  test('skips favicon and data URLs', () => {
    const candidates = collectImageUrlCandidates(
      'https://meta.ai/favicon.ico',
      'data:image/png;base64,abc 1x',
    );
    assert.equal(candidates.length, 0);
  });
});

describe('pickBestMetaImageUrl', () => {
  test('prefers fbcdn https over blob', () => {
    const best = pickBestMetaImageUrl(collectImageUrlCandidates(BLOB_URL, `${FBCDN_URL} 1280w`));
    assert.ok(best);
    assert.equal(best.url, FBCDN_URL);
    assert.equal(best.kind, 'http');
  });

  test('prefers fbcdn over generic https', () => {
    const candidates = collectImageUrlCandidates(null, [
      'https://example.com/image.jpg 1280w',
      `${FBCDN_URL} 1280w`,
    ].join(', '));

    const best = pickBestMetaImageUrl(candidates);
    assert.ok(best);
    assert.equal(best.url, FBCDN_URL);
  });

  test('falls back to blob when no http candidate exists', () => {
    const best = pickBestMetaImageUrl(collectImageUrlCandidates(BLOB_URL, null));
    assert.ok(best);
    assert.equal(best.kind, 'blob');
    assert.equal(best.url, BLOB_URL);
  });
});

describe('pickBestMetaImageUrlFromInputs', () => {
  test('scans multiple img inputs and picks best overall', () => {
    const best = pickBestMetaImageUrlFromInputs([
      { src: BLOB_URL, srcset: null },
      { src: null, srcset: `${FBCDN_URL} 1280w` },
    ]);

    assert.ok(best);
    assert.equal(best.url, FBCDN_URL);
  });
});

describe('scoreMetaImageUrl', () => {
  test('scores fbcdn highest among http hosts', () => {
    assert.ok(scoreMetaImageUrl(FBCDN_URL) > scoreMetaImageUrl('https://example.com/a.jpg'));
    assert.ok(scoreMetaImageUrl(FBCDN_URL) > scoreMetaImageUrl(BLOB_URL));
  });
});
