import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { AppError } from '../../shared/http/errors.js';
import {
  canonicalizeYoutubeVideoUrl,
  extractYoutubeVideoId,
  requireYoutubeVideoId,
} from './youtube-url.js';

describe('extractYoutubeVideoId', () => {
  test('parses watch URL', () => {
    assert.equal(
      extractYoutubeVideoId('https://www.youtube.com/watch?v=ukmdjwJ0o18'),
      'ukmdjwJ0o18',
    );
  });

  test('parses youtu.be URL', () => {
    assert.equal(extractYoutubeVideoId('https://youtu.be/ukmdjwJ0o18'), 'ukmdjwJ0o18');
  });

  test('parses youtu.be URL with trailing slash', () => {
    assert.equal(extractYoutubeVideoId('https://youtu.be/ukmdjwJ0o18/'), 'ukmdjwJ0o18');
  });

  test('parses shorts URL', () => {
    assert.equal(
      extractYoutubeVideoId('https://www.youtube.com/shorts/ukmdjwJ0o18'),
      'ukmdjwJ0o18',
    );
  });

  test('returns null for invalid URL', () => {
    assert.equal(extractYoutubeVideoId('https://example.com/video'), null);
  });
});

describe('canonicalizeYoutubeVideoUrl', () => {
  test('converts youtu.be to watch URL', () => {
    assert.equal(
      canonicalizeYoutubeVideoUrl('https://youtu.be/ukmdjwJ0o18'),
      'https://www.youtube.com/watch?v=ukmdjwJ0o18',
    );
  });

  test('normalizes watch URL', () => {
    assert.equal(
      canonicalizeYoutubeVideoUrl('https://www.youtube.com/watch?v=ukmdjwJ0o18'),
      'https://www.youtube.com/watch?v=ukmdjwJ0o18',
    );
  });

  test('throws for invalid URL', () => {
    assert.throws(
      () => canonicalizeYoutubeVideoUrl('https://example.com/not-youtube'),
      (err: unknown) => err instanceof AppError && err.code === 'INVALID_VIDEO_URL',
    );
  });
});

describe('requireYoutubeVideoId', () => {
  test('returns id from youtu.be URL', () => {
    assert.equal(requireYoutubeVideoId('https://youtu.be/ukmdjwJ0o18'), 'ukmdjwJ0o18');
  });
});
