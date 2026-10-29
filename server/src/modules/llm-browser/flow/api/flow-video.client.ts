import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'playwright';
import { env } from '../../../../config/env.js';
import { AppError } from '../../../../shared/http/errors.js';
import {
  FLOW_RECAPTCHA_SITE_KEY,
  FLOW_VIDEO_POLL_INTERVAL_MS,
  buildBatchCheckVideoStatusUrl,
  buildBatchGenerateVideoUrl,
} from '../flow.config.js';
import { appErrorFromFlowErrorTileText } from './flow-api-errors.js';
import { assertFlowApiResponseOk, callFlowApiWithRecaptchaOnPage, postFlowApi } from './flow-api.client.js';

export interface FlowVideoOperation {
  /** Raw operation entry returned by the start call; sent back unchanged when polling. */
  raw: Record<string, unknown>;
  name: string;
}

export interface FlowVideoStartInput {
  projectId: string;
  prompt: string;
  /** Flow media id of the uploaded start frame. */
  startImageMediaId: string;
  timeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function buildFlowVideoStartPayload(input: FlowVideoStartInput): Record<string, unknown> {
  return {
    clientContext: {
      recaptchaContext: { token: '', applicationType: 'RECAPTCHA_APPLICATION_TYPE_WEB' },
      sessionId: `;${Date.now()}`,
      projectId: input.projectId,
      tool: 'PINHOLE',
      userPaygateTier: env.flowVideoPaygateTier,
    },
    requests: [
      {
        aspectRatio: 'VIDEO_ASPECT_RATIO_LANDSCAPE',
        seed: crypto.randomInt(0, 1_000_000),
        textInput: { prompt: input.prompt },
        videoModelKey: env.flowVideoModelKey,
        startImage: { mediaId: input.startImageMediaId },
        metadata: {},
      },
    ],
  };
}

function operationName(entry: unknown): string {
  if (!isRecord(entry)) return '';
  const operation = entry.operation;
  if (isRecord(operation) && typeof operation.name === 'string') return operation.name;
  return typeof entry.name === 'string' ? entry.name : '';
}

/** Start one image-to-video generation. Returns the pending operation to poll. */
export async function startFlowVideoFromImage(
  page: Page,
  accessToken: string,
  input: FlowVideoStartInput,
): Promise<FlowVideoOperation> {
  const result = await callFlowApiWithRecaptchaOnPage(page, accessToken, {
    url: buildBatchGenerateVideoUrl(),
    bodyTemplate: buildFlowVideoStartPayload(input),
    siteKey: FLOW_RECAPTCHA_SITE_KEY,
    recaptchaAction: env.flowVideoRecaptchaAction,
    recaptchaTimeoutMs: input.timeoutMs,
  });
  assertFlowApiResponseOk(result);

  const operations = isRecord(result.body) ? result.body.operations : undefined;
  const first = Array.isArray(operations) ? operations[0] : undefined;
  const name = operationName(first);
  if (!isRecord(first) || !name) {
    throw new AppError(
      `Flow video start returned no operation: ${result.bodyText.slice(0, 300)}`,
      502,
      'FLOW_VIDEO_NO_OPERATION',
    );
  }
  return { raw: first, name };
}

export type FlowVideoPollEntry =
  | { state: 'pending' }
  | { state: 'done'; videoUrl: string }
  | { state: 'failed'; reason: string };

function findVideoUrl(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findVideoUrl(item);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  for (const key of ['fifeUrl', 'mediaUrl', 'videoUrl', 'fileUrl'] as const) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.startsWith('http')) return candidate;
  }
  for (const nested of Object.values(value)) {
    const found = findVideoUrl(nested);
    if (found) return found;
  }
  return null;
}

function failureText(entry: Record<string, unknown>): string {
  const operation = isRecord(entry.operation) ? entry.operation : {};
  const error = isRecord(operation.error) ? operation.error : {};
  const message = typeof error.message === 'string' ? error.message : '';
  const status = typeof entry.status === 'string' ? entry.status : '';
  return [status, message].filter(Boolean).join(' ');
}

export function classifyFlowVideoPollEntry(entry: unknown): FlowVideoPollEntry {
  if (!isRecord(entry)) return { state: 'pending' };
  const status = typeof entry.status === 'string' ? entry.status : '';
  const url = findVideoUrl(entry);

  if (status.includes('FAILED') || status.includes('FILTERED')) {
    return { state: 'failed', reason: failureText(entry) || status };
  }
  const operationDone = isRecord(entry.operation) && entry.operation.done === true;
  if (url && (status.includes('SUCCESSFUL') || operationDone)) {
    return { state: 'done', videoUrl: url };
  }
  return { state: 'pending' };
}

/** Poll operations until each is done or failed. Returns entries in the same order as `operations`. */
export async function pollFlowVideoOperations(
  accessToken: string,
  operations: FlowVideoOperation[],
  options: { timeoutMs: number; onLog?: (msg: string) => void; sleep?: (ms: number) => Promise<void> },
): Promise<FlowVideoPollEntry[]> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const deadline = Date.now() + options.timeoutMs;
  const results: FlowVideoPollEntry[] = operations.map(() => ({ state: 'pending' }));

  while (results.some(entry => entry.state === 'pending')) {
    if (Date.now() >= deadline) {
      throw new AppError(
        `Flow video generation timed out after ${Math.round(options.timeoutMs / 1000)}s`,
        504,
        'FLOW_VIDEO_TIMEOUT',
      );
    }
    await sleep(FLOW_VIDEO_POLL_INTERVAL_MS);

    const pendingIndexes = results.flatMap((entry, index) => (entry.state === 'pending' ? [index] : []));
    const response = await postFlowApi(accessToken, buildBatchCheckVideoStatusUrl(), {
      operations: pendingIndexes.map(index => operations[index]!.raw),
    });
    assertFlowApiResponseOk(response);

    const returned = isRecord(response.body) && Array.isArray(response.body.operations) ? response.body.operations : [];
    for (const entry of returned) {
      const name = operationName(entry);
      const index = pendingIndexes.find(candidate => operations[candidate]!.name === name);
      if (index === undefined) continue;
      results[index] = classifyFlowVideoPollEntry(entry);
    }
    options.onLog?.(
      `[flow-video] ${results.filter(entry => entry.state === 'done').length}/${results.length} video(s) ready`,
    );
  }
  return results;
}

/** Map a failed operation reason to the Flow error taxonomy (quota → profile switch, policy → stop). */
export function toFlowVideoFailureError(reason: string): AppError {
  return appErrorFromFlowErrorTileText(reason);
}

export async function downloadFlowVideo(page: Page, videoUrl: string, outputPath: string): Promise<void> {
  const response = await page.request.get(videoUrl);
  if (!response.ok()) {
    throw new AppError(`Failed to download Flow video (${response.status()})`, 502, 'FLOW_VIDEO_DOWNLOAD_FAILED');
  }
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, await response.body());
}
