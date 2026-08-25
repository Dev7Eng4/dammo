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
