import type { Page } from 'playwright';
import { getMetaBrowserHandler } from '../core/registry.js';
import {
  getLlmBrowserSession,
  setLlmBrowserSessionStatus,
  upsertLlmBrowserSession,
} from '../core/session.js';
import type { LlmBrowserResponse, LlmBrowserSession } from '../core/types.js';
import type { MetaGenerateMediaBatchOptions, MetaGenerateMediaOptions, MetaMediaBatchJob, MetaMediaBatchJobResult, MetaMediaBatchResult } from './meta.types.js';
import { AppError } from '../../../shared/http/errors.js';
import { emitDetailLog } from '../../video-production/shared/video-log.js';
import { getChromeProfilePage, isChromeProfileOpen, openChromeProfile } from '../../chrome-profiles/chrome-profile.runner.js';
import { chromeProfilesService } from '../../chrome-profiles/chrome-profiles.service.js';
import { MetaJobQueue } from './meta-job-queue.js';
import { downloadAndSaveMetaAsset, resolveMetaMediaSavePath } from './meta-media.js';
import {
  cleanupMetaWorkerPool,
  createMetaWorkerPool,
  META_MEDIA_DEFAULT_MAX_RETRIES,
  META_MEDIA_DEFAULT_TIMEOUT_MS,
  openMetaWorkers,
  type MetaMediaWorker,
} from './meta-media-workers.js';
import {
  isMetaProfileQuotaExhausted,
  isMetaQuotaExhaustedError,
  markMetaProfileQuotaExhausted,
  META_QUOTA_COOLDOWN_MS,
  metaQuotaExhaustedError,
} from './meta-quota.js';

const META_PROVIDER = 'meta' as const;
/** Tries to download one generated image before the whole job is run again. */
const SAVE_ATTEMPTS = 3;
const SAVE_RETRY_DELAY_MS = 1_500;

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Download + resize a generated image; independent of the tab, which already works on the next job. */
async function saveGeneratedImage(page: Page, sourceUrl: string, job: MetaMediaBatchJob): Promise<string> {
  const outputPath = resolveMetaMediaSavePath('image', { outputDir: job.outputDir, fileName: job.fileName });
  for (let attempt = 1; ; attempt += 1) {
    try {
      await downloadAndSaveMetaAsset(page, sourceUrl, outputPath, 'image', job.aspectRatio ?? '16:9');
      return outputPath;
    } catch (err) {
      if (attempt >= SAVE_ATTEMPTS) throw err;
      await new Promise(resolve => setTimeout(resolve, SAVE_RETRY_DELAY_MS * attempt));
    }
  }
}

function assertProfileOpen(profileId: string): void {
  if (!isChromeProfileOpen(profileId)) {
    throw new AppError('Chrome profile is not open', 409, 'PROFILE_NOT_OPEN');
  }
}

function assertMetaSession(profileId: string): LlmBrowserSession {
  const session = getLlmBrowserSession(profileId, META_PROVIDER);
  if (!session) {
    throw new AppError('Meta browser session is not open', 409, 'LLM_SESSION_NOT_OPEN');
  }
  return session;
}

function resolveMediaKind(options?: MetaGenerateMediaOptions): 'image' | 'video' | 'auto' {
  return options?.mediaKind ?? 'auto';
}

function resolveAspectRatio(options?: MetaGenerateMediaOptions): '16:9' | '3:4' {
  return options?.aspectRatio ?? '16:9';
}

function prependMetaMediaPrefix(
  prompt: string,
  mediaKind: 'image' | 'video' | 'auto',
  aspectRatio: '16:9' | '3:4',
): string {
  const prefix =
    mediaKind === 'video' ? 'Create video 16:9' : `Create image ${aspectRatio}`;
  const trimmed = prompt.trim();
  if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
    return prompt;
  }
  return `${prefix} ${trimmed}`;
}

export class MetaBrowserService {
  async open(profileId: string): Promise<LlmBrowserSession> {
    const profile = chromeProfilesService.getById(profileId);
    const handler = getMetaBrowserHandler();

    // Meta's menus are too heavy to draw on the CPU once several windows are open.
    await openChromeProfile(profile.id, profile.userDataDir, { background: true, gpu: true });
    const page = await getChromeProfilePage(profile.id);
    await handler.open(page);
    await handler.setupConfig(page, {});

    return upsertLlmBrowserSession(profileId, META_PROVIDER);
  }

  async openOnPage(page: Page): Promise<void> {
    const handler = getMetaBrowserHandler();
    await handler.open(page);
    await handler.setupConfig(page, {});
  }

  async generateMedia(profileId: string, prompt: string, options?: MetaGenerateMediaOptions): Promise<LlmBrowserResponse> {
    if (isMetaProfileQuotaExhausted(profileId)) {
      throw metaQuotaExhaustedError();
    }

    if (!getLlmBrowserSession(profileId, META_PROVIDER)) {
      await this.open(profileId);
    }

    assertProfileOpen(profileId);
    assertMetaSession(profileId);

    const page = await getChromeProfilePage(profileId);

    setLlmBrowserSessionStatus(profileId, META_PROVIDER, 'sending');

    try {
      const response = await this.generateMediaOnPage(page, prompt, options, {
        onPromptSent: () => setLlmBrowserSessionStatus(profileId, META_PROVIDER, 'waiting'),
      });
      setLlmBrowserSessionStatus(profileId, META_PROVIDER, 'idle');
      return response;
    } catch (err) {
      setLlmBrowserSessionStatus(profileId, META_PROVIDER, 'idle');
      if (isMetaQuotaExhaustedError(err)) markMetaProfileQuotaExhausted(profileId);
      throw err;
    }
  }

  async generateMediaOnPage(
    page: Page,
    prompt: string,
    options?: MetaGenerateMediaOptions,
    hooks?: { onPromptSent?: () => void },
  ): Promise<LlmBrowserResponse> {
    const handler = getMetaBrowserHandler();
    const mediaKind = resolveMediaKind(options);
    const aspectRatio = resolveAspectRatio(options);
    const timeoutMs = options?.timeoutMs ?? META_MEDIA_DEFAULT_TIMEOUT_MS;
    const effectivePrompt = prependMetaMediaPrefix(prompt, mediaKind, aspectRatio);

    const sent = await handler.sendPrompt(page, effectivePrompt, {
      submitWith: 'enter',
      referenceImagePaths: options?.referenceImagePaths,
    });
    hooks?.onPromptSent?.();

    return handler.receiveResponse(page, {
      mediaKind,
      aspectRatio,
      skipResize: options?.skipResize,
      outputPath: options?.outputPath,
      outputDir: options?.outputDir,
      fileName: options?.fileName,
      debugScreenshotPath: options?.debugScreenshotPath,
      timeoutMs,
      baselineBlockCount: sent?.baselineBlockCount,
    });
  }

  /**
   * Generate many Meta images with a shared worker pool. Tabs start working as soon as they are open.
   * `concurrency: 'single'` → 1 tab sequential; `'batch'` → up to 5 tabs/main + GPM.
   * Individual job failures are collected (does not abort the whole batch).
   */
  async generateMediaBatch(
    jobs: MetaMediaBatchJob[],
    options?: MetaGenerateMediaBatchOptions,
  ): Promise<MetaMediaBatchResult> {
    if (jobs.length === 0) {
      return { results: [], generatedCount: 0, failedCount: 0 };
    }

    const log = (msg: string) => {
      emitDetailLog(msg, options?.onLog);
    };
    const concurrency = options?.concurrency ?? 'batch';
    const timeoutMs = options?.timeoutMs ?? META_MEDIA_DEFAULT_TIMEOUT_MS;
    const maxRetries = options?.maxRetries ?? META_MEDIA_DEFAULT_MAX_RETRIES;

    const pool = createMetaWorkerPool();
    const queue = new MetaJobQueue(jobs.length);
    const attempts = jobs.map(() => 0);
    const results: MetaMediaBatchJobResult[] = jobs.map(job => ({ id: job.id, ok: false }));
    let generatedCount = 0;
    let failedCount = 0;

    const report = (jobIndex: number, status: 'generating' | 'done' | 'failed'): void => {
      // A throwing listener must not leave the job unfinished: idle workers would wait for it forever.
      try {
        options?.onJobProgress?.({ jobId: jobs[jobIndex].id, index: jobIndex + 1, total: jobs.length, status });
      } catch (err) {
        log(`[meta] onJobProgress failed: ${errorText(err)}`);
      }
    };

    const succeed = (jobIndex: number, localPath: string): void => {
      results[jobIndex] = { id: jobs[jobIndex].id, ok: true, localPath };
      generatedCount += 1;
      queue.finish(jobIndex);
      report(jobIndex, 'done');
    };

    const fail = (jobIndex: number, error: string): void => {
      results[jobIndex] = { id: jobs[jobIndex].id, ok: false, error };
      failedCount += 1;
      queue.finish(jobIndex);
      report(jobIndex, 'failed');
    };

    /** Counts a failed try; true when the job may run again. */
    const mayRetry = (jobIndex: number, error: string): boolean => {
      attempts[jobIndex] += 1;
      const { id } = jobs[jobIndex];
      if (attempts[jobIndex] >= maxRetries) {
        log(`[meta] bỏ qua ${id} sau ${maxRetries} lần: ${error}`);
        return false;
      }
      log(`[meta] ${id} attempt ${attempts[jobIndex]}/${maxRetries} failed → retry (${error})`);
      return true;
    };

    const saveInBackground = async (worker: MetaMediaWorker, jobIndex: number, sourceUrl: string): Promise<void> => {
      let localPath: string;
      try {
        localPath = await saveGeneratedImage(worker.page, sourceUrl, jobs[jobIndex]);
      } catch (err) {
        const error = `Failed to save image: ${errorText(err)}`;
        if (mayRetry(jobIndex, error)) queue.requeue(jobIndex);
        else fail(jobIndex, error);
        return;
      }
      succeed(jobIndex, localPath);
    };

    /** Generates one job on the worker's tab and returns the image URL; undefined when it is out of tries or quota. */
    const generateOnWorker = async (worker: MetaMediaWorker, jobIndex: number): Promise<string | undefined> => {
      const job = jobs[jobIndex];
      for (let reload = false; ; reload = true) {
        try {
          // Reload Meta so the retry starts from an empty composer — otherwise the previous
          // attachment(s) and text stay behind and get duplicated on every attempt.
          if (reload) await this.openOnPage(worker.page);
          const response = await this.generateMediaOnPage(worker.page, job.prompt, {
            mediaKind: job.mediaKind ?? 'image',
            aspectRatio: job.aspectRatio ?? '16:9',
            timeoutMs,
            ...(job.referenceImagePaths?.length ? { referenceImagePaths: job.referenceImagePaths } : {}),
          });
          const sourceUrl = response.mediaAssets?.find(asset => asset.sourceUrl)?.sourceUrl;
          if (!sourceUrl) {
            throw new AppError(`Meta media generation produced no image for ${job.id}`, 502, 'META_MEDIA_NO_FILE');
          }
          return sourceUrl;
        } catch (err) {
          if (isMetaQuotaExhaustedError(err)) {
            markMetaProfileQuotaExhausted(worker.profileId);
            log(
              `[meta] ${worker.label} hết quota tạo ảnh → không tải ảnh, dừng profile này ` +
                `(bỏ qua ${Math.round(META_QUOTA_COOLDOWN_MS / 3_600_000)}h), trả ${job.id} lại hàng đợi`,
            );
            queue.requeue(jobIndex);
            return undefined;
          }
          const error = errorText(err);
          if (mayRetry(jobIndex, error)) continue;
          fail(jobIndex, error);
          return undefined;
        }
      }
    };

    const runWorker = async (worker: MetaMediaWorker): Promise<void> => {
      const saves: Promise<void>[] = [];
      while (true) {
        // Every tab of a profile shares one Meta account, so one exhausted tab stops them all.
        if (isMetaProfileQuotaExhausted(worker.profileId)) break;

        const jobIndex = await queue.take();
        if (jobIndex === undefined) break;
        if (isMetaProfileQuotaExhausted(worker.profileId)) {
          queue.requeue(jobIndex);
          break;
        }

        report(jobIndex, 'generating');
        log(
          `[meta] worker ${worker.workerIndex + 1} (${worker.label}) → ${jobs[jobIndex].id} ` +
            `(${jobIndex + 1}/${jobs.length})`,
        );
        const sourceUrl = await generateOnWorker(worker, jobIndex);
        if (sourceUrl) saves.push(saveInBackground(worker, jobIndex, sourceUrl));
      }
      if (isMetaProfileQuotaExhausted(worker.profileId)) {
        log(`[meta] worker ${worker.workerIndex + 1} (${worker.label}) dừng: profile đã hết quota tạo ảnh`);
      }
      await Promise.all(saves);
    };

    log(`[meta] ${concurrency}: ${jobs.length} job(s)`);
    try {
      // A worker only stops early when its profile is out of quota, so each further round can only
      // use profiles that were not needed before; it ends when none is left.
      for (let round = 1; !queue.isDrained; round += 1) {
        const runs: Promise<void>[] = [];
        try {
          await openMetaWorkers(pool, {
            jobCount: queue.unfinished().length,
            mode: concurrency,
            log,
            done: queue.drained,
            onWorker: worker => {
              const run = runWorker(worker);
              // Awaited below; until then a rejection must not count as unhandled.
              run.catch(() => undefined);
              runs.push(run);
            },
          });
        } catch (err) {
          if (round === 1) throw err;
          log(`[meta] Không còn profile nào để chạy tiếp: ${errorText(err)}`);
          break;
        }
        const settled = await Promise.allSettled(runs);
        const crashed = settled.find(run => run.status === 'rejected');
        if (crashed) throw crashed.reason;
      }

      // Every profile ran out of quota before these jobs could run.
      const leftover = queue.unfinished();
      for (const jobIndex of leftover) {
        results[jobIndex] = { id: jobs[jobIndex].id, ok: false, error: metaQuotaExhaustedError().message };
        failedCount += 1;
        report(jobIndex, 'failed');
      }
      if (leftover.length > 0) {
        log(`[meta] Tất cả profile đã hết quota tạo ảnh — ${leftover.length} job còn lại bị bỏ qua`);
      }

      return { results, generatedCount, failedCount };
    } finally {
      await cleanupMetaWorkerPool(pool, log);
    }
  }
}

export const metaBrowserService = new MetaBrowserService();
