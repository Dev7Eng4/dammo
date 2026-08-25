import path from 'node:path';
import { timedStep } from '../../../../../shared/timing/step-timer.js';
import { runDramaMetadata } from '../../../shared/meta/drama/run-drama-metadata.js';
import { isDramaNiche, type VideoMetaOutput } from '../../../shared/meta/metadata.types.js';
import { runMetadata } from '../../../shared/meta/run-metadata.js';
import { runTwoStepNicheMetadata } from '../../../shared/meta/two-step/run-two-step-metadata.js';
import { isTwoStepNicheMetadata } from '../../../shared/meta/two-step/two-step-niche.config.js';
import type { VideoTaskContext } from '../video-task.context.js';

export async function runMetadataStep(ctx: VideoTaskContext): Promise<VideoMetaOutput> {
  const { destination, task, downloaded, subtitlePath, log, stepTimer } = ctx;
  const workDir = ctx.workDir;

  log.info('Creating metadata...');

  const metaOptions = {
    outputDir: workDir,
    niche: destination.niche,
    imageStyle: destination.visualStyle?.rule?.trim() || undefined,
    descriptionDisclaimer:
      destination.showDisclaimer === true && destination.descriptionDisclaimerText?.trim()
        ? destination.descriptionDisclaimerText.trim()
        : undefined,
    onProgress: log.enabled
      ? (progress: {
          attempt: number;
          profileId: string;
          profileName: string;
          status: string;
          step?: number;
        }) => {
          const profileLabel = progress.profileName;
          const stepPart = progress.step != null ? `Meta step ${progress.step}` : 'Metadata';

          if (progress.status === 'retry') {
            log.info(`${stepPart} on ${profileLabel} retry (attempt ${progress.attempt})...`);
            return;
          }

          log.info(`${stepPart} on ${profileLabel} (attempt ${progress.attempt})...`);
        }
      : undefined,
  };

  const videoMetaOutput = await timedStep(
    'Metadata',
    () => {
      if (isDramaNiche(destination.niche)) {
        return runDramaMetadata(
          task.sourceTitle,
          subtitlePath,
          destination.language,
          downloaded.youtubeVideoId,
          metaOptions,
        );
      }

      if (isTwoStepNicheMetadata(destination.language, destination.niche)) {
        return runTwoStepNicheMetadata(
          task.sourceTitle,
          subtitlePath,
          destination.language,
          downloaded.youtubeVideoId,
          metaOptions,
        );
      }

      return runMetadata(
        task.sourceTitle,
        subtitlePath,
        destination.language,
        downloaded.youtubeVideoId,
        metaOptions,
      );
    },
    stepTimer,
  );

  log.ok(
    `Metadata done → ${path.join(workDir, 'video-meta.json')}, title: ${videoMetaOutput.metadata.title}, niche: ${
      videoMetaOutput.detected_niche ?? 'n/a'
    }`,
  );

  return videoMetaOutput;
}
