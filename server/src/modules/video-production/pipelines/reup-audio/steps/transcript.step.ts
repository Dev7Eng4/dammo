import fs from 'node:fs/promises';
import path from 'node:path';
import { cleanSrt } from '../../../../../infrastructure/subtitle/clean-srt.js';
import type { TranscriptLanguage } from '../../../../../infrastructure/youtube/youtube-transcript-downloader.js';
import { timedStep } from '../../../../../shared/timing/step-timer.js';
import type { ChannelLanguage } from '../../../../youtube-channels/channel-language.js';
import { updateTranscriptWithLlm } from '../../../shared/assets/transcript-updater.js';
import type { TaskLogger } from '../task-logger.js';
import type { StepTimerOptions } from '../video-task.context.js';

export async function runCleanTranscript(
  transcriptPath: string,
  log: TaskLogger,
  stepTimer: StepTimerOptions,
): Promise<string> {
  log.info('Cleaning transcript → SRT...');

  const srtPath = await timedStep('Làm sạch SRT', () => cleanSrt(transcriptPath), stepTimer);

  log.ok(`SRT cleaned → ${srtPath}`);
  return srtPath;
}

/**
 * When the LLM update is skipped, the cleaned `transcript.<lang>.srt` becomes the
 * final `transcript.srt` (the name assemble / production UI look for), mirroring
 * what `updateTranscriptWithLlm` does with its output.
 */
export async function finalizeCleanTranscript(srtPath: string, log: TaskLogger): Promise<string> {
  const finalPath = path.join(path.dirname(srtPath), 'transcript.srt');
  if (path.resolve(finalPath) === path.resolve(srtPath)) return srtPath;

  await fs.rm(finalPath, { force: true });
  await fs.rename(srtPath, finalPath);
  await fs.rm(srtPath.replace(/\.srt$/i, '.vtt'), { force: true });

  log.ok(`Transcript saved → ${finalPath}`);
  return finalPath;
}

export async function runUpdateTranscript(
  srtPath: string,
  language: ChannelLanguage,
  log: TaskLogger,
  stepTimer: StepTimerOptions,
): Promise<string> {
  log.info(`Updating transcript via LLM (${language})...`);

  const updatedSrtPath = await timedStep(
    'Cập nhật transcript (LLM)',
    () =>
      updateTranscriptWithLlm(srtPath, language as TranscriptLanguage, {
        onProgress: log.enabled
          ? progress => {
              const label = `${progress.batchIndex}/${progress.totalBatches}`;
              const profileLabel = progress.profileName;

              if (progress.status === 'started') {
                log.info(`LLM batch ${label} on ${profileLabel} (attempt ${progress.attempt})...`);
                return;
              }

              if (progress.status === 'retry') {
                log.info(`LLM batch ${label} on ${profileLabel} retry (attempt ${progress.attempt})...`);
                return;
              }

              if (progress.status === 'fallback') {
                log.info(`LLM batch ${label} on ${profileLabel} fallback to original`);
                return;
              }

              log.ok(`LLM batch ${label} on ${profileLabel} done`);
            }
          : undefined,
      }),
    stepTimer,
  );

  log.ok('Transcript saved → transcript.srt');
  return updatedSrtPath;
}
