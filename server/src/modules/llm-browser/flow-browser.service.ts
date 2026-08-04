import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'playwright';
import {
  attachBearerCapture,
  callBatchGenerateImagesOnPage,
  getAccessTokenFromPage,
  uploadReferenceImageViaApi,
} from '../../infrastructure/llm-browser/flow-api.client.js';
import {
  downloadAndSaveFlowImage,
  extractFifeUrl,
  beginFlowToolBatchImagesCollector,
  beginBatchGenerateImagesWait,
  resolveFlowImageSavePath,
} from '../../infrastructure/llm-browser/flow-api-response.js';
import {
  FLOW_API_ACCESS_TOKEN_MAX_ATTEMPTS,
  FLOW_API_ACCESS_TOKEN_RETRY_DELAY_MS,
  FLOW_API_DELAY_AFTER_ACCESS_TOKEN_MS,
  FLOW_RECAPTCHA_ACTION,
  FLOW_RECAPTCHA_SITE_KEY,
  FLOW_TOOL_IDLE_MS,
  MAVID_EDITOR_TOOL_ID,
} from '../../infrastructure/llm-browser/flow.config.js';
import {
  openFlowProjectPage,
  openFlowToolPage,
  submitMavidEditorPrompt,
  waitForFlowProjectReady,
} from '../../infrastructure/llm-browser/providers/flow-llm.provider.js';
import { getFlowBrowserHandler } from '../../infrastructure/llm-browser/llm-browser.registry.js';
import {
  getLlmBrowserSession,
  setLlmBrowserSessionStatus,
  upsertLlmBrowserSession,
} from '../../infrastructure/llm-browser/llm-browser.session.js';
import { resolveReferenceImagePaths } from '../../infrastructure/llm-browser/resolve-reference-image-paths.js';
import type {
  FlowGenerateImageOptions,
  FlowGenerateImagesViaToolOptions,
  FlowOpenOptions,
  FlowToolVisual,
  LlmBrowserResponse,
  LlmMediaAsset,
  LlmBrowserSession,
} from '../../infrastructure/llm-browser/llm-browser.types.js';
import { AppError } from '../../shared/http/errors.js';
import { getChromeProfilePage, isChromeProfileOpen, openChromeProfile } from '../chrome-profiles/chrome-profile.runner.js';
import { chromeProfilesService } from '../chrome-profiles/chrome-profiles.service.js';
import { recordFlowProjectUsage, resolveFlowProjectId } from './flow-project.service.js';

const FLOW_PROVIDER = 'flow' as const;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function assertProfileOpen(profileId: string): void {
  if (!isChromeProfileOpen(profileId)) {
    throw new AppError('Chrome profile is not open', 409, 'PROFILE_NOT_OPEN');
  }
}

function assertFlowSession(profileId: string): LlmBrowserSession {
  const session = getLlmBrowserSession(profileId, FLOW_PROVIDER);
  if (!session) {
    throw new AppError('Flow browser session is not open', 409, 'LLM_SESSION_NOT_OPEN');
  }
  return session;
}

async function captureDebugScreenshot(page: Page, debugPath?: string): Promise<void> {
  if (!debugPath) return;
  try {
    await fs.mkdir(path.dirname(debugPath), { recursive: true });
    await page.screenshot({ path: debugPath, fullPage: true });
  } catch (err) {
    console.warn('[flow] failed to save debug screenshot:', err instanceof Error ? err.message : err);
  }
}

function toFlowApiGenerationError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  const message = err instanceof Error ? err.message : String(err);
  return new AppError(`Flow API image generation failed: ${message}`, 502, 'FLOW_API_GENERATE_FAILED');
}

async function ensureFlowChromeSession(profileId: string): Promise<Page> {
  if (!getLlmBrowserSession(profileId, FLOW_PROVIDER)) {
    const profile = chromeProfilesService.getById(profileId);
    await openChromeProfile(profile.id, profile.userDataDir, { background: true });
    upsertLlmBrowserSession(profileId, FLOW_PROVIDER);
  }

  assertProfileOpen(profileId);
  assertFlowSession(profileId);
  return getChromeProfilePage(profileId);
}

export class FlowBrowserService {
  async open(profileId: string, options?: FlowOpenOptions): Promise<LlmBrowserSession> {
    const profile = chromeProfilesService.getById(profileId);
    const handler = getFlowBrowserHandler();

    await openChromeProfile(profile.id, profile.userDataDir, { background: true });
    const page = await getChromeProfilePage(profile.id);

    const projectId = await resolveFlowProjectId(profileId, page, {
      explicitProjectId: options?.projectId,
      skipInitialSetup: options?.skipInitialSetup,
    });

    if (options?.projectId) {
      await handler.open(page, {
        projectId,
        skipInitialSetup: options?.skipInitialSetup,
      });
    }

    return upsertLlmBrowserSession(profileId, FLOW_PROVIDER);
  }

  async generateImage(profileId: string, prompt: string, options?: FlowGenerateImageOptions): Promise<LlmBrowserResponse> {
    if (options?.generationMode === 'api') {
      return this.generateImageViaApi(profileId, prompt, options);
    }

    return this.generateImageViaBrowser(profileId, prompt, options);
  }

  /**
   * Generate multiple images in one shot via the custom Flow tool.
   *
   * Injects `[{ prompt, name, references? }]` into `#david-input-prompts`, submits,
   * then matches concurrent batchGenerateImages responses by structuredPrompt text
   * and saves each image as `${outputDir}/${name}.jpg`.
   */
  async generateImagesViaTool(
    profileId: string,
    visuals: FlowToolVisual[],
    options: FlowGenerateImagesViaToolOptions,
  ): Promise<LlmBrowserResponse> {
    if (visuals.length === 0) {
      throw new AppError('generateImagesViaTool requires at least one visual', 400, 'INVALID_INPUT');
    }

    const toolId = options.toolId ?? MAVID_EDITOR_TOOL_ID;
    const timeoutMs = options.timeoutMs ?? 300_000;
    const startedAt = Date.now();
    const outputDir = path.resolve(options.outputDir);

    const page = await ensureFlowChromeSession(profileId);

    setLlmBrowserSessionStatus(profileId, FLOW_PROVIDER, 'sending');

    try {
      const projectId = await resolveFlowProjectId(profileId, page, {
        explicitProjectId: options.projectId,
        skipInitialSetup: true,
      });

      await openFlowToolPage(page, projectId, toolId);
      await fs.mkdir(outputDir, { recursive: true });

      const mediaAssets: LlmMediaAsset[] = [];

      const collectorPromise = beginFlowToolBatchImagesCollector({
        page,
        projectId,
        visuals,
        timeoutMs,
        idleMs: FLOW_TOOL_IDLE_MS,
        onMatch: async match => {
          const outputPath = path.join(outputDir, `${match.name}.jpg`);
          const asset = await downloadAndSaveFlowImage(page, match.imageUrl, outputPath);
          console.log(`[flow-tool] saved image → ${outputPath}`);
          mediaAssets.push(asset);
        },
      });
      // Prevent unhandledRejection if quota fails during submitMavidEditorPrompt delay
      void collectorPromise.catch(() => undefined);

      const promptPayload = JSON.stringify(
        visuals.map(visual => ({
          prompt: visual.prompt,
          name: visual.name,
          ...(visual.references?.length ? { references: visual.references } : {}),
        })),
      );
      await submitMavidEditorPrompt(page, promptPayload);
      setLlmBrowserSessionStatus(profileId, FLOW_PROVIDER, 'waiting');

      await collectorPromise;

      setLlmBrowserSessionStatus(profileId, FLOW_PROVIDER, 'idle');
      recordFlowProjectUsage(profileId, options.projectId);
      return {
        provider: FLOW_PROVIDER,
        content: '',
        codeBlocks: [],
        elapsedMs: Date.now() - startedAt,
        mediaAssets,
      };
    } catch (err) {
      await captureDebugScreenshot(page, options.debugScreenshotPath);
      setLlmBrowserSessionStatus(profileId, FLOW_PROVIDER, 'idle');
      if (err instanceof AppError) throw err;
      throw new AppError(
        `Flow tool image generation failed: ${err instanceof Error ? err.message : String(err)}`,
        502,
        'FLOW_TOOL_GENERATE_FAILED',
      );
    }
  }

  private async generateImageViaBrowser(
    profileId: string,
    prompt: string,
    options?: FlowGenerateImageOptions
  ): Promise<LlmBrowserResponse> {
    const handler = getFlowBrowserHandler();
    const page = await ensureFlowChromeSession(profileId);

    const projectId = await resolveFlowProjectId(profileId, page, {
      explicitProjectId: options?.projectId,
    });

    if (options?.projectId) {
      await handler.open(page, { projectId });
    }

    const timeoutMs = options?.timeoutMs ?? 300_000;
    const outputPath = resolveFlowImageSavePath(options);

    setLlmBrowserSessionStatus(profileId, FLOW_PROVIDER, 'sending');

    try {
      const batchResponsePromise = beginBatchGenerateImagesWait(page, projectId, timeoutMs);
      // Prevent unhandledRejection if quota fails during sendPrompt delay
      void batchResponsePromise.catch(() => undefined);

      await handler.sendPrompt(page, prompt, {
        pasteStrategy: options?.pasteStrategy ?? 'insertText',
        submitWith: 'enter',
        referenceImagePath: options?.referenceImagePath,
        referenceImagePaths: options?.referenceImagePaths,
      });
      setLlmBrowserSessionStatus(profileId, FLOW_PROVIDER, 'waiting');

      const response = await handler.receiveResponse(page, {
        projectId,
        batchResponsePromise,
        outputPath,
        debugScreenshotPath: options?.debugScreenshotPath,
        timeoutMs,
      });

      setLlmBrowserSessionStatus(profileId, FLOW_PROVIDER, 'idle');
      recordFlowProjectUsage(profileId, options?.projectId);
      return response;
    } catch (err) {
      setLlmBrowserSessionStatus(profileId, FLOW_PROVIDER, 'idle');
      throw err;
    }
  }

  private async generateImageViaApi(profileId: string, prompt: string, options?: FlowGenerateImageOptions): Promise<LlmBrowserResponse> {
    const timeoutMs = options?.timeoutMs ?? 300_000;
    const outputPath = resolveFlowImageSavePath(options);
    const startedAt = Date.now();

    const page = await ensureFlowChromeSession(profileId);
    const bearerCapture = attachBearerCapture(page);

    setLlmBrowserSessionStatus(profileId, FLOW_PROVIDER, 'sending');

    try {
      const projectId = await resolveFlowProjectId(profileId, page, {
        explicitProjectId: options?.projectId,
        skipInitialSetup: true,
      });

      if (options?.projectId) {
        const valid = await openFlowProjectPage(page, projectId, timeoutMs);
        if (!valid) {
          throw new AppError(
            `Flow project ${projectId} failed projectInitialData validation`,
            502,
            'FLOW_PROJECT_INVALID',
          );
        }
      }

      console.log('[flow-api] waiting for project page ready...');
      await waitForFlowProjectReady(page);

      let accessToken = '';
      for (let attempt = 1; attempt <= FLOW_API_ACCESS_TOKEN_MAX_ATTEMPTS; attempt++) {
        try {
          accessToken = await getAccessTokenFromPage(page);
          if (!accessToken) {
            accessToken = bearerCapture.getBearerToken();
          }
        } catch (err) {
          console.warn(
            `[flow-api] accessToken attempt ${attempt} failed: ${err instanceof Error ? err.message : String(err)}`
          );
        }

        if (accessToken) break;

        if (attempt < FLOW_API_ACCESS_TOKEN_MAX_ATTEMPTS) {
          await sleep(FLOW_API_ACCESS_TOKEN_RETRY_DELAY_MS);
        }
      }

      if (!accessToken) {
        throw new AppError(
          'Could not obtain Flow accessToken. Ensure the Chrome profile is logged into Google Flow.',
          502,
          'FLOW_API_NO_ACCESS_TOKEN'
        );
      }

      const referenceMediaIds: string[] = [];
      const referencePaths = resolveReferenceImagePaths(options);

      if (referencePaths.length > 0) {
        console.log(`[flow-api] uploading ${referencePaths.length} reference image(s)...`);
        for (const imagePath of referencePaths) {
          try {
            const mediaId = await uploadReferenceImageViaApi(accessToken, imagePath, projectId);
            if (!mediaId) {
              throw new AppError(
                `Flow reference image upload failed: ${imagePath}`,
                502,
                'FLOW_API_REFERENCE_UPLOAD_FAILED',
              );
            }
            referenceMediaIds.push(mediaId);
            console.log(`[flow-api] reference mediaId: ${mediaId} ← ${imagePath}`);
          } catch (err) {
            if (err instanceof AppError) {
              throw err;
            }
            throw new AppError(
              `Flow reference image upload error: ${err instanceof Error ? err.message : String(err)}`,
              502,
              'FLOW_API_REFERENCE_UPLOAD_FAILED',
            );
          }
        }
      }

      console.log(`[flow-api] delay ${FLOW_API_DELAY_AFTER_ACCESS_TOKEN_MS}ms after accessToken`);
      await sleep(FLOW_API_DELAY_AFTER_ACCESS_TOKEN_MS);

      setLlmBrowserSessionStatus(profileId, FLOW_PROVIDER, 'waiting');

      console.log('[flow-api] calling batchGenerateImages (browser fetch + reCAPTCHA)...');
      const apiResponse = await callBatchGenerateImagesOnPage(page, accessToken, {
        prompt,
        projectId,
        referenceMediaIds,
        siteKey: FLOW_RECAPTCHA_SITE_KEY,
        recaptchaAction: FLOW_RECAPTCHA_ACTION,
        recaptchaTimeoutMs: timeoutMs,
      });

      console.log(`[flow-api] status: ${apiResponse.status} ${apiResponse.statusText}`);

      let imageUrl: string;
      try {
        imageUrl = extractFifeUrl(apiResponse.body);
      } catch (err) {
        throw new AppError(
          `Flow API response missing image URL: ${err instanceof Error ? err.message : String(err)}`,
          502,
          'FLOW_API_NO_IMAGE_URL'
        );
      }

      console.log(`[flow-api] extracted image url: ${imageUrl.slice(0, 80)}...`);

      let mediaAsset;
      try {
        mediaAsset = await downloadAndSaveFlowImage(page, imageUrl, outputPath);
      } catch (err) {
        throw new AppError(
          `Failed to download Flow image: ${err instanceof Error ? err.message : String(err)}`,
          502,
          'FLOW_IMAGE_DOWNLOAD_FAILED'
        );
      }

      setLlmBrowserSessionStatus(profileId, FLOW_PROVIDER, 'idle');
      recordFlowProjectUsage(profileId, options?.projectId);
      return {
        provider: FLOW_PROVIDER,
        content: '',
        codeBlocks: [],
        elapsedMs: Date.now() - startedAt,
        mediaAssets: [mediaAsset],
      };
    } catch (err) {
      const appError = toFlowApiGenerationError(err);
      console.error(`[flow-api] generate failed (${appError.code ?? 'unknown'}): ${appError.message}`);
      await captureDebugScreenshot(page, options?.debugScreenshotPath);
      setLlmBrowserSessionStatus(profileId, FLOW_PROVIDER, 'idle');
      throw appError;
    } finally {
      bearerCapture.dispose();
    }
  }
}

export const flowBrowserService = new FlowBrowserService();
