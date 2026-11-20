import path from 'node:path';
import { timedStep } from '../../../../../shared/timing/step-timer.js';
import { runCelebrityWisdomMetadata } from '../../../shared/meta/celebrity-wisdom/run-celebrity-wisdom-metadata.js';
import { runDramaMetadata } from '../../../shared/meta/drama/run-drama-metadata.js';
import {
  isCelebrityWisdomNiche,
  isDramaNiche,
  type VideoMetaOutput,
} from '../../../shared/meta/metadata.types.js';
import { runMetadata } from '../../../shared/meta/run-metadata.js';
import { runTwoStepNicheMetadata } from '../../../shared/meta/two-step/run-two-step-metadata.js';
import { isTwoStepNicheMetadata } from '../../../shared/meta/two-step/two-step-niche.config.js';
import type { VideoTaskContext } from '../video-task.context.js';
import {
  buildRecentFormatsHint,
  readRecentClusterFormats,
} from '../../../shared/meta/cluster-format-history.js';

export async function runMetadataStep(ctx: VideoTaskContext): Promise<VideoMetaOutput> {
  const { destination, task, downloaded, subtitlePath, log, stepTimer } = ctx;
  const workDir = ctx.workDir;

  log.info('Creating metadata...');

  // Cluster meta prompts pick a format per video; tell them which formats this channel used lately (rotation).
  const recentFormats = await readRecentClusterFormats(destination.id, workDir).catch(() => []);
  const recentFormatsHint = buildRecentFormatsHint(recentFormats);
  if (recentFormats.length > 0) log.info(`[format] recent formats: ${recentFormats.join(', ')}`);

  const metaOptions = {
    outputDir: workDir,
    niche: destination.niche,
    imageStyle: destination.visualStyle?.rule?.trim() || undefined,
    ...(recentFormatsHint ? { extraInstructions: recentFormatsHint } : {}),
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

  const generated = await timedStep(
    'Metadata',
    () => {
      if (isCelebrityWisdomNiche(destination.niche)) {
        return runCelebrityWisdomMetadata(
          task.sourceTitle,
          subtitlePath,
          destination.language,
          downloaded.youtubeVideoId,
          metaOptions,
        );
      }

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
  const videoMetaOutput = generated;
  if (videoMetaOutput.cluster_format) {
    const choice = videoMetaOutput.cluster_format;
    log.info(`[format] ${choice.format} (${choice.cluster_role})${choice.reason ? ` — ${choice.reason}` : ''}`);
    if (choice.cluster_role === 'off') {
      log.info('[format] WARNING: this source video is outside the channel cluster — check the source channels');
    }
  }

  log.ok(
    `Metadata done → ${path.join(workDir, 'video-meta.json')}, title: ${videoMetaOutput.metadata.title}, niche: ${
      videoMetaOutput.detected_niche ?? 'n/a'
    }`,
  );

  return videoMetaOutput;
}
