import fs from 'node:fs/promises';
import path from 'node:path';
import type { LlmBrowserResponse } from '../../../../infrastructure/llm-browser/llm-browser.types.js';

export interface PersistLlmParseFailureInput {
  outputDir?: string;
  label: string;
  attempt: number;
  reason: string;
  response: LlmBrowserResponse;
}

function sanitizeLabel(label: string): string {
  return label
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'llm';
}

/**
 * Writes the full LLM browser response next to the video work dir for offline tracing.
 * Returns the absolute file path, or undefined when outputDir is missing / IO fails.
 */
export async function persistLlmParseFailure(
  input: PersistLlmParseFailureInput,
): Promise<string | undefined> {
  const outputDir = input.outputDir?.trim();
  if (!outputDir) return undefined;

  const debugDir = path.join(outputDir, 'llm-debug');
  const fileName = `${sanitizeLabel(input.label)}-attempt-${input.attempt}.json`;
  const filePath = path.join(debugDir, fileName);

  try {
    await fs.mkdir(debugDir, { recursive: true });
    const payload = {
      savedAt: new Date().toISOString(),
      label: input.label,
      attempt: input.attempt,
      reason: input.reason,
      provider: input.response.provider,
      content: input.response.content,
      codeBlocks: input.response.codeBlocks,
      elapsedMs: input.response.elapsedMs,
    };
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
    console.warn(`[llm-debug] saved parse failure → ${filePath}`);
    return filePath;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(`[llm-debug] failed to save parse failure for ${input.label}: ${detail}`);
    return undefined;
  }
}
