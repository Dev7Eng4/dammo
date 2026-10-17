import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildChannelTabUrl, isMissingChannelTabError, stripChannelTab } from './channel-tabs.js';

describe('channel tab urls', () => {
  test('strips a trailing slash and tab segment', () => {
    assert.equal(stripChannelTab('https://www.youtube.com/@x/'), 'https://www.youtube.com/@x');
    assert.equal(stripChannelTab('https://www.youtube.com/@x/videos'), 'https://www.youtube.com/@x');
    assert.equal(stripChannelTab('https://www.youtube.com/@x/Shorts/'), 'https://www.youtube.com/@x');
  });

  test('does not strip handles that merely look like tabs', () => {
    assert.equal(stripChannelTab('https://www.youtube.com/@videos'), 'https://www.youtube.com/@videos');
  });

  test('builds a tab url from any channel url form', () => {
    assert.equal(buildChannelTabUrl('https://www.youtube.com/@x', 'videos'), 'https://www.youtube.com/@x/videos');
    assert.equal(buildChannelTabUrl('https://www.youtube.com/@x/videos', 'shorts'), 'https://www.youtube.com/@x/shorts');
  });
});

describe('isMissingChannelTabError', () => {
  test('matches the yt-dlp message from a channel without a videos tab', () => {
    assert.equal(
      isMissingChannelTabError(
        'ERROR: [youtube:tab] @Gyakuten_Dramaa: This channel does not have a videos tab',
      ),
      true,
    );
    assert.equal(isMissingChannelTabError('This channel does not have a shorts tab'), true);
  });

  test('ignores unrelated errors', () => {
    assert.equal(isMissingChannelTabError('HTTP Error 429: Too Many Requests'), false);
    assert.equal(isMissingChannelTabError('Sign in to confirm you are not a bot'), false);
  });
});
