import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { ProductionDestination } from '../../../ports/production-destination.port.js';
import type { VideoCreationOrder } from '../../../../youtube-channels/youtube-channels.types.js';
import { buildTasks, type SourceVideoWithSource } from './task-selection.js';

function mockDestination(
  preparedIds: string[] = [],
  videoCreationOrder?: VideoCreationOrder,
): ProductionDestination {
  const prepared = new Set(preparedIds);
  return {
    id: 'ch1',
    name: 'Test Channel',
    pipelineType: 'reup_audio',
    language: 'en',
    niche: 'all',
    sourceChannels: [],
    videoCreationOrder,
    getVideoOutputDir: () => '/tmp',
    getPreparedVideoIds: () => prepared,
    trackPreparedVideo: () => {},
    ensurePrepareStore: () => {},
  };
}

function video(
  id: string,
  viewCount?: number,
  sourceId = 'src1',
  duration?: number,
): SourceVideoWithSource {
  return {
    id,
    title: id,
    url: `https://youtube.com/watch?v=${id}`,
    viewCount,
    duration,
    sourceId,
  };
}

describe('buildTasks lowest_views_first', () => {
  test('picks unprocessed videos with lowest views first', () => {
    const videos = [
      video('high-views', 5000),
      video('low-views', 50),
      video('mid-views', 200),
    ];
    const destination = mockDestination([], 'lowest_views_first');
    const { tasks } = buildTasks(destination, videos, { maxVideosPerChannel: 3 });

    assert.deepEqual(
      tasks.map(task => task.videoId),
      ['low-views', 'mid-views', 'high-views'],
    );
  });

  test('skips prepared videos', () => {
    const videos = [
      video('prepared', 10),
      video('next', 20),
      video('last', 30),
    ];
    const destination = mockDestination(['prepared'], 'lowest_views_first');
    const { tasks } = buildTasks(destination, videos, { maxVideosPerChannel: 2 });

    assert.deepEqual(tasks.map(task => task.videoId), ['next', 'last']);
  });

  test('puts videos without viewCount after videos with views', () => {
    const videos = [
      video('no-view'),
      video('has-view', 100),
      video('also-no-view'),
    ];
    const destination = mockDestination([], 'lowest_views_first');
    const { tasks } = buildTasks(destination, videos, { maxVideosPerChannel: 3 });

    assert.equal(tasks[0]?.videoId, 'has-view');
    assert.deepEqual(
      tasks.slice(1).map(task => task.videoId).sort(),
      ['also-no-view', 'no-view'],
    );
  });

  test('breaks view ties by picking older videos first', () => {
    const videos = [
      video('newer-tie', 100),
      video('older-tie', 100),
    ];
    const destination = mockDestination([], 'lowest_views_first');
    const { tasks } = buildTasks(destination, videos, { maxVideosPerChannel: 2 });

    assert.deepEqual(tasks.map(task => task.videoId), ['older-tie', 'newer-tie']);
  });
});

describe('buildTasks shortest_duration_first', () => {
  test('picks unprocessed videos with shortest duration first', () => {
    const videos = [
      video('long', undefined, 'src1', 600),
      video('short', undefined, 'src1', 60),
      video('mid', undefined, 'src1', 300),
    ];
    const destination = mockDestination([], 'shortest_duration_first');
    const { tasks } = buildTasks(destination, videos, { maxVideosPerChannel: 3 });

    assert.deepEqual(
      tasks.map(task => task.videoId),
      ['short', 'mid', 'long'],
    );
  });

  test('skips prepared videos', () => {
    const videos = [
      video('prepared', undefined, 'src1', 60),
      video('next', undefined, 'src1', 120),
      video('last', undefined, 'src1', 180),
    ];
    const destination = mockDestination(['prepared'], 'shortest_duration_first');
    const { tasks } = buildTasks(destination, videos, { maxVideosPerChannel: 2 });

    assert.deepEqual(tasks.map(task => task.videoId), ['next', 'last']);
  });

  test('puts videos without duration after videos with duration', () => {
    const videos = [
      video('no-duration'),
      video('has-duration', undefined, 'src1', 100),
      video('also-no-duration'),
    ];
    const destination = mockDestination([], 'shortest_duration_first');
    const { tasks } = buildTasks(destination, videos, { maxVideosPerChannel: 3 });

    assert.equal(tasks[0]?.videoId, 'has-duration');
    assert.deepEqual(
      tasks.slice(1).map(task => task.videoId).sort(),
      ['also-no-duration', 'no-duration'],
    );
  });

  test('breaks duration ties by picking older videos first', () => {
    const videos = [
      video('newer-tie', undefined, 'src1', 100),
      video('older-tie', undefined, 'src1', 100),
    ];
    const destination = mockDestination([], 'shortest_duration_first');
    const { tasks } = buildTasks(destination, videos, { maxVideosPerChannel: 2 });

    assert.deepEqual(tasks.map(task => task.videoId), ['older-tie', 'newer-tie']);
  });
});
