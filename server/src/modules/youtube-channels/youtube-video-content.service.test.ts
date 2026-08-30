import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import {
  resolveYoutubeChannelUploadedVideoDir,
  youtubeChannelUploadedVideoDir,
} from '../../config/paths.js';
import { youtubeVideoContentService } from './youtube-video-content.service.js';

const SAMPLE_CHANNEL_ID = '5fe84e56-5c0c-4384-9057-8e711d524556';
const SAMPLE_UPLOAD_VIDEO_ID = 'cfgLX-D75rk';

describe('resolveYoutubeChannelUploadedVideoDir', () => {
  test('resolves existing uploads folder', () => {
    const uploadsDir = youtubeChannelUploadedVideoDir(SAMPLE_CHANNEL_ID, SAMPLE_UPLOAD_VIDEO_ID);
    if (!fs.existsSync(uploadsDir)) return;

    const resolved = resolveYoutubeChannelUploadedVideoDir(SAMPLE_CHANNEL_ID, SAMPLE_UPLOAD_VIDEO_ID);
    assert.equal(resolved, uploadsDir);
  });

  test('returns null for missing uploads folder', () => {
    assert.equal(
      resolveYoutubeChannelUploadedVideoDir(SAMPLE_CHANNEL_ID, 'missing-video-id'),
      null,
    );
  });
});

describe('youtubeVideoContentService uploads folder', () => {
  test('loads content from uploads folder for published local video', () => {
    const uploadsDir = youtubeChannelUploadedVideoDir(SAMPLE_CHANNEL_ID, SAMPLE_UPLOAD_VIDEO_ID);
    if (!fs.existsSync(uploadsDir)) return;

    const content = youtubeVideoContentService.get(SAMPLE_CHANNEL_ID, SAMPLE_UPLOAD_VIDEO_ID);

    assert.ok(content.title.trim().length > 0);
    assert.ok(content.videoFolderPath.includes(path.join('uploads', SAMPLE_UPLOAD_VIDEO_ID)));
  });
});
