import fs from 'node:fs/promises';
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
import { resolveVoicevoxCredit } from '../../../../voice/voicevox-credit.js';
import type { RemakeOutlineHint } from '../../../../video-production-ui/channel-video-remake.service.js';
import {
  buildRecentFormatsHint,
  readRecentClusterFormats,
} from '../../../shared/meta/cluster-format-history.js';

/**
 * On remake channels the transcript is a new script with its own angle, but "Title cũ" is still the source
 * video's title, and the model drifts back to it because the topic matches. Tell it what the remake chose.
 */
export function buildRemakeOutlineHint(outline: RemakeOutlineHint | undefined): string {
  if (!outline?.title.trim()) return '';
  const lines = [
    `- Title kịch bản remake: ${outline.title.trim()}`,
    ...(outline.angle.trim() ? [`- Góc mới của bản remake: ${outline.angle.trim()}`] : []),
  ];
  return `\n\n====================================================\nVIDEO NÀY LÀ BẢN REMAKE\n====================================================\nTranscript là kịch bản MỚI viết lại từ video gốc; "Title cũ" là title video gốc của kênh khác, chỉ để tránh trùng.\n${lines.join('\n')}\n- Bám góc mới này khi chọn cái móc và viết title / chữ thumbnail (không bắt buộc giữ nguyên title kịch bản, vẫn theo format và luật title của cụm). Không quay lại cụm từ của title cũ.\n`;
}

/**
 * Outline of the newest remake saved in `<workDir>/remake/remake-*.json` (a remake run earlier from the UI),
 * or undefined when the folder has none or it cannot be read.
 */
export async function readLatestRemakeOutline(workDir: string): Promise<RemakeOutlineHint | undefined> {
  const dir = path.join(workDir, 'remake');
  try {
    const files = (await fs.readdir(dir)).filter(name => /^remake-.+\.json$/.test(name)).sort();
    const latest = files.at(-1);
    if (!latest) return undefined;
    const parsed = JSON.parse(await fs.readFile(path.join(dir, latest), 'utf8')) as {
      outline?: { title?: unknown; angle?: unknown; hook?: unknown };
    };
    const outline = parsed.outline;
    if (typeof outline?.title !== 'string' || !outline.title.trim()) return undefined;
    const text = (value: unknown) => (typeof value === 'string' ? value : '');
    return { title: outline.title, angle: text(outline.angle), hook: text(outline.hook) };
  } catch {
    return undefined;
  }
}

export async function runMetadataStep(ctx: VideoTaskContext): Promise<VideoMetaOutput> {
  const { destination, task, downloaded, subtitlePath, log, stepTimer } = ctx;
  const workDir = ctx.workDir;

  log.info('Creating metadata...');

  // Cluster meta prompts pick a format per video; tell them which formats this channel used lately (rotation).
  const recentFormats = await readRecentClusterFormats(destination.id, workDir).catch(() => []);
  const recentFormatsHint = buildRecentFormatsHint(recentFormats);
  if (recentFormats.length > 0) log.info(`[format] recent formats: ${recentFormats.join(', ')}`);

  const remakeOutline = ctx.remakeOutline ?? (await readLatestRemakeOutline(workDir));
  if (remakeOutline) log.info(`[remake] metadata follows the remake angle: ${remakeOutline.title}`);
  const extraInstructions = [recentFormatsHint, buildRemakeOutlineHint(remakeOutline)].filter(Boolean).join('');

  // VOICEVOX narration must be credited in the description (VOICEVOX:キャラクター名), after the channel's disclaimer.
  const voicevoxCredit = await resolveVoicevoxCredit(workDir);
  if (voicevoxCredit) log.info(`[voice] description credit: ${voicevoxCredit}`);
  const disclaimer =
    destination.showDisclaimer === true && destination.descriptionDisclaimerText?.trim()
      ? destination.descriptionDisclaimerText.trim()
      : '';
  const descriptionFooter = [disclaimer, voicevoxCredit ?? ''].filter(Boolean).join('\n\n');

  const metaOptions = {
    outputDir: workDir,
    niche: destination.niche,
    imageStyle: destination.visualStyle?.rule?.trim() || undefined,
    ...(extraInstructions ? { extraInstructions } : {}),
    descriptionDisclaimer: descriptionFooter || undefined,
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
