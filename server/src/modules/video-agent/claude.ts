import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/http/errors.js';
import type { VideoAgentUsage } from './video-agent.types.js';

/** USD per 1M tokens: input, output, cache write (5-minute TTL), cache read. */
const PRICES: Record<string, [number, number, number, number]> = {
  'claude-opus-5-5': [4, 20, 5, 0.2],
  'claude-sonnet-5-5': [2, 10, 2.5, 0.2],
  'claude-haiku-5-5': [0.1, 0.5, 0.125, 0.01],
};

/** Refusals are rerouted server-side to Anthropic's recommended fallback model. */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

let client: Anthropic | null = null;

export function getClaudeClient(): Anthropic {
  if (!client) {
    // Credentials resolve from ANTHROPIC_API_KEY (server/.env) or an `ant auth login` profile.
    client = new Anthropic();
  }
  return client;
}

export function emptyUsage(): VideoAgentUsage {
  return { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 };
}

export function addUsage(total: VideoAgentUsage, model: string, usage: Anthropic.Beta.BetaUsage): void {
  const [input, output, cacheWrite, cacheRead] = PRICES[model] ?? PRICES[env.videoAgentModel] ?? PRICES['claude-opus-5-5'];
  const read = usage.cache_read_input_tokens ?? 0;
  const write = usage.cache_creation_input_tokens ?? 0;
  total.calls += 1;
  total.inputTokens += usage.input_tokens;
  total.outputTokens += usage.output_tokens;
  total.cacheReadTokens += read;
  total.cacheWriteTokens += write;
  total.costUsd +=
    (usage.input_tokens * input + usage.output_tokens * output + write * cacheWrite + read * cacheRead) / 1_000_000;
}

/** Turns SDK errors into messages a dammo user can act on. */
export function describeClaudeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return 'Claude API: thiếu hoặc sai ANTHROPIC_API_KEY trong server/.env';
  }
  if (err instanceof Anthropic.RateLimitError) return 'Claude API: bị giới hạn tốc độ (429), thử lại sau';
  if (err instanceof Anthropic.BadRequestError) return `Claude API từ chối request: ${err.message}`;
  if (err instanceof Anthropic.APIError) return `Claude API lỗi ${err.status ?? ''}: ${err.message}`;
  if (err instanceof AppError) return err.message;
  const message = err instanceof Error ? err.message : String(err);
  // The SDK throws a plain Error before any request when it finds no credentials at all.
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return `Chưa cấu hình ANTHROPIC_API_KEY trong server/.env (${message})`;
  }
  return message;
}

export function assertNotRefused(message: Anthropic.Beta.BetaMessage): void {
  if (message.stop_reason === 'refusal') {
    const category = message.stop_details?.category ?? 'không rõ';
    throw new AppError(`Claude từ chối yêu cầu (category: ${category})`, 422, 'CLAUDE_REFUSAL');
  }
}
