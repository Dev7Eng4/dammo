import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  META_INVALID_IMAGE_SOURCE_CODE,
  assertMetaGeneratedImageUrl,
  isHttpUrl,
  isIgnoredImageUrl,
  isMetaGeneratedImageUrl,
  pickMetaImageSrc,
} from './meta-image-url.js';

const GENERATED_URL =
  'https://scontent.xx.fbcdn.net/v/t39.105495-1/788019520_1626258532277052_8483277982140937533_n.webp?_nc_ht=scontent.xx.fbcdn.net';
const OTHER_FBCDN_URL = 'https://scontent-sin6-2.xx.fbcdn.net/v/t1.0-9/reference.jpg';
const INSTAGRAM_URL = 'https://scontent.cdninstagram.com/v/image.jpg';
const BLOB_URL = 'blob:https://www.meta.ai/abc-123-def';

describe('isHttpUrl / isIgnoredImageUrl', () => {
  test('detects http(s) URLs', () => {
    assert.equal(isHttpUrl(GENERATED_URL), true);
    assert.equal(isHttpUrl(BLOB_URL), false);
  });

  test('ignores empty and favicon URLs', () => {
    assert.equal(isIgnoredImageUrl(''), true);
    assert.equal(isIgnoredImageUrl('https://meta.ai/favicon.ico'), true);
    assert.equal(isIgnoredImageUrl(GENERATED_URL), false);
  });
});

describe('isMetaGeneratedImageUrl', () => {
  test('accepts only https://scontent.xx.fbcdn.net/', () => {
    assert.equal(isMetaGeneratedImageUrl(GENERATED_URL), true);
    assert.equal(isMetaGeneratedImageUrl(OTHER_FBCDN_URL), false);
    assert.equal(isMetaGeneratedImageUrl(INSTAGRAM_URL), false);
    assert.equal(isMetaGeneratedImageUrl('http://scontent.xx.fbcdn.net/a.jpg'), false);
    assert.equal(isMetaGeneratedImageUrl(BLOB_URL), false);
    assert.equal(isMetaGeneratedImageUrl(null), false);
  });
});

describe('pickMetaImageSrc', () => {
  test('prefers the generated-host src over other http srcs', () => {
    assert.equal(pickMetaImageSrc([OTHER_FBCDN_URL, GENERATED_URL]), GENERATED_URL);
  });

  test('falls back to the first http src so it can be rejected', () => {
    assert.equal(pickMetaImageSrc([BLOB_URL, OTHER_FBCDN_URL]), OTHER_FBCDN_URL);
  });

  test('returns null while only blob/data/empty srcs exist', () => {
    assert.equal(pickMetaImageSrc([BLOB_URL, 'data:image/png;base64,abc', null, '']), null);
  });
});

describe('assertMetaGeneratedImageUrl', () => {
  test('passes for generated URLs', () => {
    assert.doesNotThrow(() => assertMetaGeneratedImageUrl(GENERATED_URL));
  });

  test('throws a retryable error for anything else', () => {
    assert.throws(
      () => assertMetaGeneratedImageUrl(OTHER_FBCDN_URL),
      (err: unknown) => (err as { code?: string }).code === META_INVALID_IMAGE_SOURCE_CODE,
    );
  });
});
