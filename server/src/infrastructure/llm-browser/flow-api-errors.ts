import { AppError } from '../../shared/http/errors.js';

export const FLOW_DAILY_QUOTA_EXHAUSTED = 'FLOW_DAILY_QUOTA_EXHAUSTED';
export const FLOW_API_RATE_LIMITED = 'FLOW_API_RATE_LIMITED';
/** Browser DOM error tile: prompt/policy rejection — do not switch profiles. */
export const FLOW_POLICY_VIOLATION = 'FLOW_POLICY_VIOLATION';
/** Browser DOM error tile: other failure — switch to another main profile. */
export const FLOW_BROWSER_TILE_ERROR = 'FLOW_BROWSER_TILE_ERROR';

export type FlowErrorTileKind = 'quota' | 'policy' | 'other';

const DAILY_QUOTA_REASON = 'PUBLIC_ERROR_PER_MODEL_DAILY_QUOTA_REACHED';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getErrorRecord(body: unknown): Record<string, unknown> | null {
  if (!isRecord(body)) return null;
  const error = body.error;
  if (!isRecord(error)) return null;
  return error;
}

/**
 * Detect Google Flow daily per-model quota exhaustion (distinct from transient 429 rate limits).
 *
 * Typical body:
 * `{ error: { code: 429, status: "RESOURCE_EXHAUSTED", details: [{ reason: "PUBLIC_ERROR_PER_MODEL_DAILY_QUOTA_REACHED" }] } }`
 */
export function isFlowDailyQuotaExhausted(status: number, body: unknown): boolean {
  if (status !== 429) return false;

  const error = getErrorRecord(body);
  if (!error) return false;

  if (error.status === 'RESOURCE_EXHAUSTED') return true;

  const details = error.details;
  if (!Array.isArray(details)) return false;

  return details.some(detail => {
    if (!isRecord(detail)) return false;
    return detail.reason === DAILY_QUOTA_REASON;
  });
}

export function isFlowDailyQuotaError(err: unknown): boolean {
  return err instanceof AppError && err.code === FLOW_DAILY_QUOTA_EXHAUSTED;
}

export function isFlowPolicyViolationError(err: unknown): boolean {
  return err instanceof AppError && err.code === FLOW_POLICY_VIOLATION;
}

/** Errors that should close the current profile and try another main profile. */
export function isFlowProfileSwitchError(err: unknown): boolean {
  return (
    isFlowDailyQuotaError(err) || (err instanceof AppError && err.code === FLOW_BROWSER_TILE_ERROR)
  );
}

/**
 * Classify browser `flow-error-tile` text (case-insensitive).
 * - `limit` → daily quota
 * - else `generate` / `generation` → policy violation
 * - else → other (profile switch)
 */
export function classifyFlowErrorTileText(text: string): FlowErrorTileKind {
  const lower = text.toLowerCase();
  if (lower.includes('limit')) return 'quota';
  if (lower.includes('generate') || lower.includes('generation')) return 'policy';
  return 'other';
}

export function createFlowDailyQuotaError(detail?: string): AppError {
  const message = detail
    ? `Flow daily quota exhausted: ${detail}`
    : 'Flow daily quota exhausted (RESOURCE_EXHAUSTED / PUBLIC_ERROR_PER_MODEL_DAILY_QUOTA_REACHED)';
  console.warn(`[flow-quota] ${message}`);
  return new AppError(message, 429, FLOW_DAILY_QUOTA_EXHAUSTED);
}

export function createFlowPolicyViolationError(detail?: string): AppError {
  const message = detail
    ? `Flow policy violation: ${detail}`
    : 'Flow policy violation (prompt rejected)';
  console.warn(`[flow-policy] ${message}`);
  return new AppError(message, 422, FLOW_POLICY_VIOLATION);
}

export function createFlowBrowserTileError(detail?: string): AppError {
  const message = detail
    ? `Flow browser generation failed: ${detail}`
    : 'Flow browser generation failed (error tile)';
  console.warn(`[flow-tile] ${message}`);
  return new AppError(message, 502, FLOW_BROWSER_TILE_ERROR);
}

export function appErrorFromFlowErrorTileText(text: string): AppError {
  const trimmed = text.trim();
  switch (classifyFlowErrorTileText(trimmed)) {
    case 'quota':
      return createFlowDailyQuotaError(trimmed);
    case 'policy':
      return createFlowPolicyViolationError(trimmed);
    default:
      return createFlowBrowserTileError(trimmed);
  }
}

/**
 * Throw AppError for a failed batchGenerateImages response.
 * Daily quota → FLOW_DAILY_QUOTA_EXHAUSTED; other 429 → FLOW_API_RATE_LIMITED.
 */
export function throwIfFlowBatchGenerateFailed(status: number, body: unknown, bodyText: string): void {
  if (status >= 200 && status < 300) return;

  if (isFlowDailyQuotaExhausted(status, body)) {
    const error = getErrorRecord(body);
    const detail =
      error && typeof error.message === 'string' ? error.message : bodyText.slice(0, 300);
    throw createFlowDailyQuotaError(detail);
  }

  const code = status === 429 ? FLOW_API_RATE_LIMITED : 'FLOW_API_GENERATE_FAILED';
  let message = `Flow batchGenerateImages failed: HTTP ${status}`;
  const trimmed = bodyText.trim();
  if (trimmed) {
    message += ` — ${trimmed.length <= 500 ? trimmed : `${trimmed.slice(0, 500)}...`}`;
  }

  throw new AppError(message, status >= 400 && status < 600 ? status : 502, code);
}
