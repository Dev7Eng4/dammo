import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { withClipboardLock } from './human-interaction.js';

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

describe('withClipboardLock', () => {
  test('parallel tabs never overwrite each other between copy and paste', async () => {
    let clipboard = '';
    const pasted = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        withClipboardLock(async () => {
          clipboard = `prompt ${index}`;
          await sleep(5);
          return clipboard;
        }),
      ),
    );
    assert.deepEqual(pasted, Array.from({ length: 10 }, (_, index) => `prompt ${index}`));
  });

  test('a failing task releases the clipboard', async () => {
    await assert.rejects(withClipboardLock(async () => Promise.reject(new Error('boom'))), /boom/);
    assert.equal(await withClipboardLock(async () => 'next'), 'next');
  });

  test('a hanging task is given up so the others can go on', async () => {
    const hanging = withClipboardLock(() => new Promise<string>(() => undefined), 20);
    const next = withClipboardLock(async () => 'next');
    await assert.rejects(hanging, /clipboard held longer than 20ms/);
    assert.equal(await next, 'next');
  });
});
