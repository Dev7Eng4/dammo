import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { YoutubeChannelVideo } from '../../infrastructure/youtube/youtube-channel.types.js';
import { mergeChannelVideos } from './merge-channel-videos.js';
import type { VideoPrepareItem } from './video-prepare.types.js';

describe('mergeChannelVideos', () => {
  test('includes uploads-only videos as Published', () => {
    const uploadedFromFolder: YoutubeChannelVideo[] = [
      {
        id: 'cfgLX-D75rk',
        title: 'Upload folder video',
        url: 'https://www.youtube.com/watch?v=cfgLX-D75rk',
      },
    ];

    const result = mergeChannelVideos([], [], uploadedFromFolder);

    assert.equal(result.length, 1);
    assert.equal(result[0]?.id, 'cfgLX-D75rk');
    assert.equal(result[0]?.status, 'Published');
    assert.equal(result[0]?.localFolder, 'uploads');
  });

  test('dedupes uploads when video id already exists in published sync', () => {
    const published: YoutubeChannelVideo[] = [
      {
        id: 'abc123',
        title: 'Synced video',
        url: 'https://www.youtube.com/watch?v=abc123',
        viewCount: 100,
      },
    ];
    const uploadedFromFolder: YoutubeChannelVideo[] = [
      {
        id: 'abc123',
        title: 'Upload folder title',
        url: 'https://www.youtube.com/watch?v=abc123',
      },
    ];

    const result = mergeChannelVideos(published, [], uploadedFromFolder);

    assert.equal(result.length, 1);
    assert.equal(result[0]?.title, 'Synced video');
    assert.equal(result[0]?.viewCount, 100);
    assert.equal(result[0]?.status, 'Published');
    assert.equal(result[0]?.localFolder, 'uploads');
  });

  test('keeps Prepared and Created videos while excluding Uploaded prepare items', () => {
    const prepare: VideoPrepareItem[] = [
      {
        id: 'prep-1',
        videoId: 'prepared-id',
        title: 'Prepared video',
        status: 'Prepared',
      },
      {
        id: 'prep-2',
        videoId: 'created-id',
        title: 'Created video',
        status: 'Created',
      },
      {
        id: 'prep-3',
        videoId: 'uploaded-id',
        title: 'Uploaded video',
        status: 'Uploaded',
      },
    ];

    const result = mergeChannelVideos([], prepare, []);

    assert.equal(result.length, 2);
    assert.deepEqual(
      result.map(video => ({ id: video.id, status: video.status })),
      [
        { id: 'prepared-id', status: 'Prepared' },
        { id: 'created-id', status: 'Created' },
      ],
    );
  });

  test('puts remote-only Published videos after uploads and prepare', () => {
    const published: YoutubeChannelVideo[] = [
      {
        id: 'remote-1',
        title: 'Remote only',
        url: 'https://www.youtube.com/watch?v=remote-1',
        viewCount: 10,
      },
      {
        id: 'synced-upload',
        title: 'Synced with uploads',
        url: 'https://www.youtube.com/watch?v=synced-upload',
        viewCount: 20,
      },
      {
        id: 'remote-2',
        title: 'Another remote',
        url: 'https://www.youtube.com/watch?v=remote-2',
        viewCount: 30,
      },
    ];
    const uploadedFromFolder: YoutubeChannelVideo[] = [
      {
        id: 'synced-upload',
        title: 'Upload folder title',
        url: 'https://www.youtube.com/watch?v=synced-upload',
      },
      {
        id: 'uploads-only',
        title: 'Uploads only',
        url: 'https://www.youtube.com/watch?v=uploads-only',
      },
    ];
    const prepare: VideoPrepareItem[] = [
      {
        id: 'prep-1',
        videoId: 'prepared-id',
        title: 'Prepared video',
        status: 'Prepared',
      },
    ];

    const result = mergeChannelVideos(published, prepare, uploadedFromFolder);

    assert.deepEqual(
      result.map(video => video.id),
      ['synced-upload', 'uploads-only', 'prepared-id', 'remote-1', 'remote-2'],
    );
    assert.equal(result[0]?.localFolder, 'uploads');
    assert.equal(result[1]?.localFolder, 'uploads');
    assert.equal(result[3]?.localFolder, undefined);
    assert.equal(result[4]?.localFolder, undefined);
  });
});
