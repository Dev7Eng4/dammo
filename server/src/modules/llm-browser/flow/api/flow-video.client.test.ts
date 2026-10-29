import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildFlowVideoStartPayload, classifyFlowVideoPollEntry, pollFlowVideoOperations } from './flow-video.client.js';

describe('classifyFlowVideoPollEntry', () => {
  test('pending until a successful entry carries a url', () => {
    assert.deepEqual(classifyFlowVideoPollEntry({ status: 'MEDIA_GENERATION_STATUS_PENDING' }), { state: 'pending' });
  });

  test('done when successful with a nested fifeUrl', () => {
    const entry = {
      status: 'MEDIA_GENERATION_STATUS_SUCCESSFUL',
      operation: { name: 'op1', metadata: { video: { fifeUrl: 'https://flow-content.google/video/abc' } } },
    };
    assert.deepEqual(classifyFlowVideoPollEntry(entry), { state: 'done', videoUrl: 'https://flow-content.google/video/abc' });
  });

  test('failed carries the status and message', () => {
    const entry = {
      status: 'MEDIA_GENERATION_STATUS_FAILED',
      operation: { name: 'op1', error: { message: 'PUBLIC_ERROR_UNSAFE_GENERATION' } },
    };
    const result = classifyFlowVideoPollEntry(entry);
    assert.equal(result.state, 'failed');
    assert.match((result as { reason: string }).reason, /UNSAFE_GENERATION/);
  });
});

describe('buildFlowVideoStartPayload', () => {
  test('sends the start frame media id and prompt', () => {
    const payload = buildFlowVideoStartPayload({ projectId: 'proj', prompt: 'move', startImageMediaId: 'media-1' });
    const request = (payload.requests as Record<string, unknown>[])[0]!;
    assert.deepEqual(request.startImage, { mediaId: 'media-1' });
    assert.deepEqual(request.textInput, { prompt: 'move' });
    assert.equal((payload.clientContext as Record<string, unknown>).projectId, 'proj');
  });
});

describe('pollFlowVideoOperations', () => {
  test('times out when nothing finishes', async () => {
    await assert.rejects(
      pollFlowVideoOperations('token', [{ raw: {}, name: 'op1' }], { timeoutMs: 0, sleep: async () => undefined }),
      /timed out/,
    );
  });
});
