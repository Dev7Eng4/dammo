import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'playwright';
import { AppError } from '../../shared/http/errors.js';
import { FLOW_API_REQUEST_HEADERS, FLOW_SESSION_URL, buildBatchGenerateImagesUrl, buildUploadImageUrl } from './flow.config.js';

function randomBatchId(): string {
  return crypto.randomUUID();
}

function randomSeed(): number {
  return crypto.randomInt(0, 1_000_000);
}

function buildSessionId(nowMs = Date.now()): string {
  return `;${nowMs}`;
}

function detectMimeType(imagePath: string): string {
  const ext = path.extname(imagePath).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    default:
      return 'image/jpeg';
  }
}

function extractFlowApiErrorDetail(body: unknown, bodyText: string): string {
  if (typeof body === 'object' && body !== null) {
    const record = body as Record<string, unknown>;
    for (const key of ['message', 'detail', 'status'] as const) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }

    const nestedError = record.error;
    if (typeof nestedError === 'string' && nestedError.trim()) return nestedError.trim();
    if (typeof nestedError === 'object' && nestedError !== null) {
      const nestedMessage = (nestedError as Record<string, unknown>).message;
      if (typeof nestedMessage === 'string' && nestedMessage.trim()) return nestedMessage.trim();
    }
  }

  const trimmed = bodyText.trim();
  if (!trimmed) return '';
  return trimmed.length <= 500 ? trimmed : `${trimmed.slice(0, 500)}...`;
}

function flowApiHttpErrorCode(status: number): string {
  switch (status) {
    case 401:
      return 'FLOW_API_UNAUTHORIZED';
    case 403:
      return 'FLOW_API_FORBIDDEN';
    case 429:
      return 'FLOW_API_RATE_LIMITED';
    default:
      return 'FLOW_API_GENERATE_FAILED';
  }
}

export interface BuildBatchGeneratePayloadOptions {
  prompt: string;
  projectId: string;
  recaptchaToken: string;
  primaryMediaId?: string | null;
}

export function buildBatchGeneratePayload(options: BuildBatchGeneratePayloadOptions): Record<string, unknown> {
  const { prompt, projectId, recaptchaToken, primaryMediaId } = options;
  const sessionId = buildSessionId();
  const batchId = randomBatchId();
  const seed = randomSeed();

  const recaptchaContext = {
    token: recaptchaToken,
    applicationType: 'RECAPTCHA_APPLICATION_TYPE_WEB',
  };

  const clientContext = {
    recaptchaContext,
    projectId,
    tool: 'PINHOLE',
    sessionId,
  };

  const imageInputs = primaryMediaId ? [{ imageInputType: 'IMAGE_INPUT_TYPE_REFERENCE', name: primaryMediaId }] : [];

  return {
    clientContext,
    mediaGenerationContext: { batchId },
    useNewMedia: true,
    requests: [
      {
        clientContext: { ...clientContext },
        imageModelName: 'GEM_PIX_2',
        imageAspectRatio: 'IMAGE_ASPECT_RATIO_LANDSCAPE',
        structuredPrompt: {
          parts: [{ text: prompt }],
        },
        seed,
        imageInputs,
      },
    ],
  };
}

export interface BearerCapture {
  getBearerToken: () => string;
  dispose: () => void;
}

export function attachBearerCapture(page: Page): BearerCapture {
  let bearerToken = '';

  const onRequest = (request: { url: () => string; headers: () => Record<string, string> }) => {
    const url = request.url();
    if (!url.includes('aisandbox-pa.googleapis.com')) return;

    const headers = request.headers();
    const auth = headers.authorization || headers.Authorization;
    if (!auth?.startsWith('Bearer ')) return;

    bearerToken = auth.slice('Bearer '.length).trim();
  };

  page.on('request', onRequest);

  return {
    getBearerToken: () => bearerToken,
    dispose: () => page.off('request', onRequest),
  };
}

export async function getAccessTokenFromPage(page: Page, sessionUrl = FLOW_SESSION_URL): Promise<string> {
  try {
    const session = await page.evaluate(async (url: string) => {
      const res = await fetch(url, {
        credentials: 'include',
        headers: { accept: 'application/json' },
      });
      if (!res.ok) return null;
      return res.json() as Promise<{ access_token?: string } | null>;
    }, sessionUrl);

    return session?.access_token || '';
  } catch {
    return '';
  }
}

export async function uploadReferenceImageViaApi(accessToken: string, imagePath: string, projectId: string): Promise<string | null> {
  if (!accessToken.trim()) {
    console.error('[flow-api] uploadReferenceImageViaApi: missing accessToken');
    return null;
  }

  try {
    const imageBuffer = await fs.readFile(imagePath);
    const imageBase64 = imageBuffer.toString('base64');
    const fileName = path.basename(imagePath);
    const mimeType = detectMimeType(imagePath);

    const body = {
      clientContext: { projectId, tool: 'PINHOLE' },
      imageBytes: imageBase64,
      isUserUploaded: true,
      isHidden: false,
      mimeType,
      fileName,
    };

    const response = await fetch(buildUploadImageUrl(), {
      method: 'POST',
      headers: {
        ...FLOW_API_REQUEST_HEADERS,
        authorization: `Bearer ${accessToken.trim()}`,
      },
      body: JSON.stringify(body),
    });

    const responseText = await response.text();

    let responseJson: Record<string, unknown> | null = null;
    try {
      responseJson = JSON.parse(responseText) as Record<string, unknown>;
    } catch {
      responseJson = null;
    }

    if (!response.ok) {
      const detail = extractFlowApiErrorDetail(responseJson, responseText);
      let message = `uploadReferenceImageViaApi failed: HTTP ${response.status} ${response.statusText}`;
      if (detail) message += ` — ${detail}`;
      if (response.status === 403) {
        message += '. Possible causes: expired access token or invalid upload permissions.';
      }
      console.error(`[flow-api] ${message}`);
      console.error(responseText.slice(0, 1_000));
      return null;
    }

    const workflow = responseJson?.workflow as { metadata?: { primaryMediaId?: string } } | undefined;
    const media = responseJson?.media as { name?: string } | undefined;
    const primaryMediaId = workflow?.metadata?.primaryMediaId || media?.name || null;

    if (!primaryMediaId) {
      console.error('[flow-api] uploadReferenceImageViaApi: primaryMediaId not found in response');
      console.error(responseText);
    }

    return primaryMediaId;
  } catch (err) {
    console.error('[flow-api] uploadReferenceImageViaApi error:', err instanceof Error ? err.message : err);
    return null;
  }
}

export interface CallBatchGenerateImagesOptions {
  prompt: string;
  projectId: string;
  primaryMediaId?: string | null;
}

export interface CallBatchGenerateImagesResult {
  ok: boolean;
  status: number;
  statusText: string;
  bodyText: string;
  body: unknown;
}

export function assertFlowApiResponseOk(result: CallBatchGenerateImagesResult): void {
  if (result.ok) return;

  const detail = extractFlowApiErrorDetail(result.body, result.bodyText);
  const code = flowApiHttpErrorCode(result.status);
  let message = `Flow batchGenerateImages failed: HTTP ${result.status} ${result.statusText}`;

  if (detail) {
    message += ` — ${detail}`;
  }

  if (result.status === 403) {
    message += '. Possible causes: expired access token, invalid reCAPTCHA token, or outdated x-browser-validation request headers.';
  } else if (result.status === 401) {
    message += '. Ensure the Chrome profile is logged into Google Flow and the session is still valid.';
  }

  console.error(`[flow-api] ${message}`);
  if (result.bodyText) {
    console.error(`[flow-api] response body: ${result.bodyText.slice(0, 1_000)}`);
  }

  throw new AppError(message, result.status, code);
}

/**
 * Browser-side script: reCAPTCHA execute + batchGenerateImages fetch in one tick.
 * Plain string avoids tsx/esbuild injecting __name into page.evaluate callbacks.
 */
const BATCH_GENERATE_BROWSER_SCRIPT = `async (payload) => {
  const { key, act, timeout, url, bearerToken, apiHeaders, bodyTemplate } = payload;
  const deadline = Date.now() + timeout;

  await new Promise((resolve, reject) => {
    const poll = () => {
      const enterprise = window.grecaptcha?.enterprise;
      if (typeof enterprise?.ready === 'function' && typeof enterprise?.execute === 'function') {
        resolve(undefined);
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error('grecaptcha.enterprise not loaded'));
        return;
      }
      setTimeout(poll, 200);
    };
    poll();
  });

  const recaptchaToken = await new Promise((resolve, reject) => {
    window.grecaptcha.enterprise.ready(() => {
      window.grecaptcha.enterprise
        .execute(key, { action: act })
        .then(resolve)
        .catch((err) => reject(err instanceof Error ? err : new Error(String(err))));
    });
  });

  const body = structuredClone(bodyTemplate);
  const rootContext = body.clientContext;
  if (rootContext && typeof rootContext === 'object') {
    const recaptchaContext = rootContext.recaptchaContext;
    if (recaptchaContext && typeof recaptchaContext === 'object') {
      recaptchaContext.token = recaptchaToken;
    }
  }
  const requests = body.requests;
  if (Array.isArray(requests) && requests[0] && typeof requests[0] === 'object') {
    const requestContext = requests[0].clientContext;
    if (requestContext && typeof requestContext === 'object') {
      const recaptchaContext = requestContext.recaptchaContext;
      if (recaptchaContext && typeof recaptchaContext === 'object') {
        recaptchaContext.token = recaptchaToken;
      }
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...apiHeaders,
      authorization: 'Bearer ' + bearerToken,
    },
    body: JSON.stringify(body),
  });

  const bodyText = await response.text();
  let parsedBody = null;
  try {
    parsedBody = JSON.parse(bodyText);
  } catch {
    parsedBody = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    bodyText,
    body: parsedBody,
  };
}`;

const batchGeneratePageFunction = new Function(
  `return (${BATCH_GENERATE_BROWSER_SCRIPT})`,
)() as (payload: {
  key: string;
  act: string;
  timeout: number;
  url: string;
  bearerToken: string;
  apiHeaders: Record<string, string>;
  bodyTemplate: Record<string, unknown>;
}) => Promise<CallBatchGenerateImagesResult>;

export interface CallBatchGenerateImagesOnPageOptions extends CallBatchGenerateImagesOptions {
  siteKey: string;
  recaptchaAction: string;
  recaptchaTimeoutMs?: number;
}

export async function callBatchGenerateImagesOnPage(
  page: Page,
  bearerToken: string,
  options: CallBatchGenerateImagesOnPageOptions
): Promise<CallBatchGenerateImagesResult> {
  if (!bearerToken.trim()) {
    throw new AppError('Missing Bearer token for Flow batchGenerateImages', 502, 'FLOW_API_NO_BEARER');
  }

  if (!options.siteKey.trim()) {
    throw new AppError('FLOW_RECAPTCHA_SITE_KEY is not configured', 502, 'FLOW_API_RECAPTCHA_FAILED');
  }

  const bodyTemplate = buildBatchGeneratePayload({
    prompt: options.prompt,
    projectId: options.projectId,
    recaptchaToken: '',
    primaryMediaId: options.primaryMediaId,
  });

  const url = buildBatchGenerateImagesUrl(options.projectId);
  const { authorization: _auth, ...apiHeaders } = FLOW_API_REQUEST_HEADERS;

  let result: CallBatchGenerateImagesResult;
  try {
    result = await page.evaluate(batchGeneratePageFunction, {
      key: options.siteKey,
      act: options.recaptchaAction,
      timeout: options.recaptchaTimeoutMs ?? 60_000,
      url,
      bearerToken: bearerToken.trim(),
      apiHeaders,
      bodyTemplate,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[flow-api] batchGenerateImages browser fetch error: ${detail}`);
    throw new AppError(`Flow batchGenerateImages browser fetch error: ${detail}`, 502, 'FLOW_API_NETWORK_ERROR');
  }

  assertFlowApiResponseOk(result);
  return result;
}

export async function callBatchGenerateImages(
  recaptchaToken: string,
  bearerToken: string,
  options: CallBatchGenerateImagesOptions
): Promise<CallBatchGenerateImagesResult> {
  if (!bearerToken.trim()) {
    throw new AppError('Missing Bearer token for Flow batchGenerateImages', 502, 'FLOW_API_NO_BEARER');
  }

  const payload = buildBatchGeneratePayload({
    prompt: options.prompt,
    projectId: options.projectId,
    recaptchaToken,
    primaryMediaId: options.primaryMediaId,
  });

  let response: Response;
  try {
    response = await fetch(buildBatchGenerateImagesUrl(options.projectId), {
      method: 'POST',
      headers: {
        ...FLOW_API_REQUEST_HEADERS,
        authorization: `Bearer ${bearerToken.trim()}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[flow-api] batchGenerateImages network error: ${detail}`);
    throw new AppError(`Flow batchGenerateImages network error: ${detail}`, 502, 'FLOW_API_NETWORK_ERROR');
  }

  let responseText = '';
  try {
    responseText = await response.text();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[flow-api] batchGenerateImages response read error: ${detail}`);
    throw new AppError(`Flow batchGenerateImages response read error: ${detail}`, 502, 'FLOW_API_RESPONSE_READ_FAILED');
  }

  let responseJson: unknown = null;
  try {
    responseJson = JSON.parse(responseText);
  } catch {
    responseJson = null;
  }

  const result: CallBatchGenerateImagesResult = {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    bodyText: responseText,
    body: responseJson,
  };

  assertFlowApiResponseOk(result);
  return result;
}
