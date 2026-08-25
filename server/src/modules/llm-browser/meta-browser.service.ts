import type { Page } from 'playwright';
import { getMetaBrowserHandler } from '../../infrastructure/llm-browser/llm-browser.registry.js';
import {
  getLlmBrowserSession,
  setLlmBrowserSessionStatus,
  upsertLlmBrowserSession,
} from '../../infrastructure/llm-browser/llm-browser.session.js';
import type {
  LlmBrowserResponse,
  LlmBrowserSession,
  MetaGenerateMediaBatchOptions,
  MetaGenerateMediaOptions,
  MetaMediaBatchJob,
  MetaMediaBatchJobResult,
  MetaMediaBatchResult,
} from '../../infrastructure/llm-browser/llm-browser.types.js';
import { AppError } from '../../shared/http/errors.js';
import { getChromeProfilePage, isChromeProfileOpen, openChromeProfile } from '../chrome-profiles/chrome-profile.runner.js';
import { chromeProfilesService } from '../chrome-profiles/chrome-profiles.service.js';
import {
  cleanupMetaWorkerPool,
  META_MEDIA_DEFAULT_MAX_RETRIES,
  META_MEDIA_DEFAULT_TIMEOUT_MS,
  openMetaWorkerPool,
  type MetaMediaWorker,
} from './meta-media-workers.js';

const META_PROVIDER = 'meta' as const;

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

    await openChromeProfile(profile.id, profile.userDataDir, { background: true });
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

    await handler.sendPrompt(page, effectivePrompt, {
      pasteStrategy: options?.pasteStrategy ?? 'human',
      submitWith: 'enter',
      referenceImagePaths: options?.referenceImagePaths,
    });
    hooks?.onPromptSent?.();

    return handler.receiveResponse(page, {
      mediaKind,
      aspectRatio,
      outputPath: options?.outputPath,
      outputDir: options?.outputDir,
      fileName: options?.fileName,
      debugScreenshotPath: options?.debugScreenshotPath,
      timeoutMs,
    });
  }

  /**
   * Generate many Meta images with a shared worker pool.
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
      console.log(msg);
      options?.onLog?.(msg);
    };
    const concurrency = options?.concurrency ?? 'batch';
    const timeoutMs = options?.timeoutMs ?? META_MEDIA_DEFAULT_TIMEOUT_MS;
    const maxRetries = options?.maxRetries ?? META_MEDIA_DEFAULT_MAX_RETRIES;
    const pasteStrategy = options?.pasteStrategy ?? 'human';

    const pool = await openMetaWorkerPool(jobs.length, log, concurrency);
    const { workers } = pool;
    let nextJobIndex = 0;
    const results: MetaMediaBatchJobResult[] = jobs.map(job => ({ id: job.id, ok: false }));
    let generatedCount = 0;
    let failedCount = 0;

    log(
      `[meta] ${concurrency}: ${workers.length} worker(s) ` +
        `[${workers.map(worker => worker.label).join(', ')}] cho ${jobs.length} job(s)`,
    );

    const runWorker = async (worker: MetaMediaWorker): Promise<void> => {
      while (true) {
        const jobIndex = nextJobIndex;
        nextJobIndex += 1;
        if (jobIndex >= jobs.length) return;

        const job = jobs[jobIndex];
        options?.onJobProgress?.({
          jobId: job.id,
          index: jobIndex + 1,
          total: jobs.length,
          status: 'generating',
        });
        log(
          `[meta] worker ${worker.workerIndex + 1}/${workers.length} (${worker.label}) → ${job.id} ` +
            `(${jobIndex + 1}/${jobs.length})`,
        );

        let lastError = 'unknown error';
        let succeeded = false;

        for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
          try {
            const response = await this.generateMediaOnPage(worker.page, job.prompt, {
              mediaKind: job.mediaKind ?? 'image',
              aspectRatio: job.aspectRatio ?? '16:9',
              outputDir: job.outputDir,
              fileName: job.fileName,
              timeoutMs,
              pasteStrategy,
              ...(job.referenceImagePaths?.length ? { referenceImagePaths: job.referenceImagePaths } : {}),
            });

            const localPath = response.mediaAssets?.find(asset => asset.localPath)?.localPath;
            if (!localPath) {
              throw new AppError(`Meta media generation produced no file for ${job.id}`, 502, 'META_MEDIA_NO_FILE');
            }

            results[jobIndex] = { id: job.id, ok: true, localPath };
            generatedCount += 1;
            succeeded = true;
            options?.onJobProgress?.({
              jobId: job.id,
              index: jobIndex + 1,
              total: jobs.length,
              status: 'done',
            });
            break;
          } catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
            if (attempt === maxRetries) {
              log(`[meta] bỏ qua ${job.id} sau ${maxRetries} lần: ${lastError}`);
            } else {
              log(`[meta] ${job.id} attempt ${attempt}/${maxRetries} failed → retry (${lastError})`);
            }
          }
        }

        if (!succeeded) {
          results[jobIndex] = { id: job.id, ok: false, error: lastError };
          failedCount += 1;
          options?.onJobProgress?.({
            jobId: job.id,
            index: jobIndex + 1,
            total: jobs.length,
            status: 'failed',
          });
        }
      }
    };

    try {
      await Promise.all(workers.map(worker => runWorker(worker)));
      return { results, generatedCount, failedCount };
    } finally {
      await cleanupMetaWorkerPool(pool, log);
    }
  }
}

export const metaBrowserService = new MetaBrowserService();
