import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { pickChannelAvatarUrl } from './channel-avatar.js';

describe('pickChannelAvatarUrl', () => {
  test('prefers the avatar_uncropped entry', () => {
    const url = pickChannelAvatarUrl([
      { id: 'banner_uncropped', url: 'https://yt3.example/banner', width: 2560, height: 424 },
      { id: 'avatar_uncropped', url: 'https://yt3.example/avatar', width: 900, height: 900 },
      { url: 'https://yt3.example/square-small', width: 88, height: 88 },
    ]);
    assert.equal(url, 'https://yt3.example/avatar');
  });

  test('falls back to the largest square image and ignores banners', () => {
    const url = pickChannelAvatarUrl([
      { url: 'https://yt3.example/banner', width: 1060, height: 175 },
      { url: 'https://yt3.example/sq-88', width: 88, height: 88 },
      { url: 'https://yt3.example/sq-176', width: 176, height: 176 },
    ]);
    assert.equal(url, 'https://yt3.example/sq-176');
  });

  test('returns undefined when there is no avatar-like image or no thumbnails', () => {
    assert.equal(pickChannelAvatarUrl(undefined), undefined);
    assert.equal(pickChannelAvatarUrl([]), undefined);
    assert.equal(
      pickChannelAvatarUrl([{ url: 'https://yt3.example/banner', width: 1060, height: 175 }]),
      undefined,
    );
  });

  test('ignores non-http urls', () => {
    assert.equal(
      pickChannelAvatarUrl([{ id: 'avatar_uncropped', url: 'javascript:alert(1)', width: 900, height: 900 }]),
      undefined,
    );
  });
});
