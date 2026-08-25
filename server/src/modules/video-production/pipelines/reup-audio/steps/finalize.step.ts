import path from 'node:path';
import { mediaDownloadDir } from '../../../../../config/paths.js';
import { generateId } from '../../../../../shared/id.js';
import { timedStep } from '../../../../../shared/timing/step-timer.js';
import { videoPrepareRepository } from '../../../../youtube-channels/video-prepare.repository.js';
import { findFinalVideoMp4 } from '../../../shared/render-core/video-output-file.js';
import type { ProductionDestination } from '../../../ports/production-destination.port.js';
import { moveVideoFolderToDestination, remapOutputItemPaths } from '../video-folder-mover.js';
import type { TaskLogger } from '../task-logger.js';
import type { StepTimerOptions } from '../video-task.context.js';
import type { ReupVideoOutputItem } from '../reup-audio.types.js';

function resolveVideoPrepareTitle(outputItem: ReupVideoOutputItem): string {
  const title = outputItem.videoMetaOutput?.metadata?.title;
  if (typeof title === 'string' && title.trim()) {
    return title.trim();
  }
  return outputItem.youtubeVideoId;
}

/**
 * Move the working folder into the channel's output dir, then record the video
 * in video-prepare.json as Prepared (or Created once the final mp4 exists).
 */
export async function runFinalizeStep(
  outputItem: ReupVideoOutputItem,
  destination: ProductionDestination,
  options: { skipVideoAssembly: boolean; log: TaskLogger; stepTimer: StepTimerOptions },
): Promise<ReupVideoOutputItem> {
  const { skipVideoAssembly, log, stepTimer } = options;

  const sourceDir = mediaDownloadDir('youtube', outputItem.youtubeVideoId);
  const expectedDestDir = destination.getVideoOutputDir(outputItem.youtubeVideoId);
  const destDir = await timedStep(
    'Di chuyển thư mục video',
    () => moveVideoFolderToDestination('youtube', outputItem.youtubeVideoId, expectedDestDir),
    stepTimer,
  );

  const remapped = remapOutputItemPaths(outputItem, sourceDir, destDir);

  if (path.resolve(destDir) !== path.resolve(expectedDestDir)) {
    return remapped;
  }

  destination.trackPreparedVideo({
    id: generateId(),
    videoId: remapped.youtubeVideoId,
    title: resolveVideoPrepareTitle(remapped),
    status: 'Prepared',
  });

  log.ok('Video prepare tracked → video-prepare.json');

  if (skipVideoAssembly) {
    log.ok('Video assets saved → status Prepared in video-prepare.json');
    return remapped;
  }

  /* No final mp4 yet (assembly skipped for a missing input) — stays Prepared. */
  if (findFinalVideoMp4(destDir)) {
    videoPrepareRepository.markCreated(destination.id, remapped.youtubeVideoId);
    log.ok('Video ready → status Created in video-prepare.json');
  }

  return remapped;
}
