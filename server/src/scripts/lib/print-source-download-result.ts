import type { DownloadSourceVideosResult } from '../../modules/source-channels/source-download.service.js';

export function printSourceDownloadBatchResult(results: DownloadSourceVideosResult[]): void {
  const totalDownloaded = results.reduce((sum, r) => sum + r.downloaded.length, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failed.length, 0);

  console.log('');
  console.log(`Hoàn tất: ${totalDownloaded} downloaded, ${totalFailed} failed (${results.length} source(s))`);
  console.log('');

  for (const result of results) {
    console.log(`  [${result.sourceName}] downloaded: ${result.downloaded.length}, failed: ${result.failed.length}`);

    for (const videoId of result.downloaded) {
      console.log(`            ✓ ${videoId}`);
    }

    for (const failure of result.failed) {
      console.log(`            ✗ ${failure.videoId}: ${failure.reason}`);
    }
  }
}
