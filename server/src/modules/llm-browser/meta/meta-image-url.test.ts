import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  classifyMetaImageUrl,
  collectImageUrlCandidates,
  isBlobUrl,
  isHttpUrl,
  isIgnoredImageUrl,
  isMetaCdnImageUrl,
  parseSrcsetUrls,
  pickBestMetaImageUrl,
  pickBestMetaImageUrlFromInputs,
  scoreMetaImageUrl,
} from './meta-image-url.js';

const FBCDN_URL =
  'https://scontent.xx.fbcdn.net/v/t39.105495-1/788019520_1626258532277052_8483277982140937533_n.webp?_nc_ht=scontent.xx.fbcdn.net';
const SCONTENT_URL = 'https://scontent.cdninstagram.com/v/image.jpg';
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

describe('isMetaCdnImageUrl', () => {
  test('accepts only http(s) fbcdn.net / scontent. URLs', () => {
    assert.equal(isMetaCdnImageUrl(FBCDN_URL), true);
    assert.equal(isMetaCdnImageUrl(SCONTENT_URL), true);
    assert.equal(isMetaCdnImageUrl('https://example.com/a.jpg'), false);
    assert.equal(isMetaCdnImageUrl(BLOB_URL), false);
  });
});

describe('classifyMetaImageUrl', () => {
  test('classifies supported URL kinds', () => {
    assert.equal(classifyMetaImageUrl(FBCDN_URL), 'http');
    assert.equal(classifyMetaImageUrl(SCONTENT_URL), 'http');
    assert.equal(classifyMetaImageUrl('https://example.com/a.jpg'), 'unsupported');
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
  test('collects only fbcdn/scontent URLs without duplicates', () => {
    const candidates = collectImageUrlCandidates(
      BLOB_URL,
      `${FBCDN_URL} 1280w, ${FBCDN_URL} 640w, https://example.com/a.jpg 320w`,
    );

    assert.deepEqual(
      candidates.map(candidate => candidate.url),
      [FBCDN_URL],
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

  test('prefers fbcdn over scontent', () => {
    const candidates = collectImageUrlCandidates(null, [
      `${SCONTENT_URL} 1280w`,
      `${FBCDN_URL} 1280w`,
    ].join(', '));

    const best = pickBestMetaImageUrl(candidates);
    assert.ok(best);
    assert.equal(best.url, FBCDN_URL);
  });

  test('returns null when only blob or other hosts exist', () => {
    assert.equal(pickBestMetaImageUrl(collectImageUrlCandidates(BLOB_URL, null)), null);
    assert.equal(
      pickBestMetaImageUrl(collectImageUrlCandidates('https://example.com/a.jpg', null)),
      null,
    );
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
  test('scores fbcdn above scontent and rejects everything else', () => {
    assert.ok(scoreMetaImageUrl(FBCDN_URL) > scoreMetaImageUrl(SCONTENT_URL));
    assert.equal(scoreMetaImageUrl('https://example.com/a.jpg'), 0);
    assert.equal(scoreMetaImageUrl(BLOB_URL), 0);
  });
});
