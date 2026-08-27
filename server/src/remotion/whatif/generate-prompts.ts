import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDataDirs } from '../../config/paths.js';
import type { LlmBrowserResponse, LlmTextProvider } from '../../infrastructure/llm-browser/llm-browser.types.js';
import type { ChromeProfile } from '../../modules/chrome-profiles/chrome-profiles.types.js';
import { chromeProfilesService } from '../../modules/chrome-profiles/chrome-profiles.service.js';
import { llmBrowserService } from '../../modules/llm-browser/llm-browser.service.js';
import { promptsSettingsService } from '../../modules/prompts/prompts-settings.service.js';
import { extractJsonText } from '../../modules/video-production/shared/meta/meta-response.js';
import { data } from './input.js';
import { prompt as promptStep1 } from './prompts/whatIfOneStep1.js';
import { prompt as promptStep2 } from './prompts/whatIfOneStep2.js';

const MAX_CONCURRENT_PROFILES = 5;
const MAX_RETRIES = 3;
const ITEM_DELAY_MS = 1_500;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'output');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'results.json');

export interface WhatIfInputItem {
  title: string;
  description: string;
  explain?: string;
}

export interface WhatIfPromptResult {
  name: string;
  prompt: string;
}

type WhatIfStatus = 'started' | 'ok' | 'retry' | 'fallback';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```[\w]*\n?/gm, '')
    .replace(/\n?```$/gm, '')
    .trim();
}

function parseWhatIfStep1Scene(response: LlmBrowserResponse): string | null {
  try {
    const jsonText = extractJsonText(response);
    const parsed: unknown = JSON.parse(jsonText);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    const scene = (parsed as Record<string, unknown>).scene;
    if (typeof scene !== 'string' || scene.trim().length === 0) {
      return null;
    }
    return scene.trim();
  } catch {
    return null;
  }
}

function extractImagePrompt(response: LlmBrowserResponse): string | null {
  const fromBlocks = response.codeBlocks
    .map(block => stripMarkdownFences(block))
    .find(text => text.length > 0);
  const text = fromBlocks ?? stripMarkdownFences(response.content);
  return text.length > 0 ? text : null;
}

function logItem(
  profileName: string,
  itemIndex: number,
  total: number,
  attempt: number,
  status: WhatIfStatus,
  detail?: string,
): void {
  const suffix = detail ? ` (${detail})` : '';
  console.log(
    `[whatif] profile ${profileName} item ${itemIndex}/${total} attempt ${attempt} status ${status}${suffix}`,
  );
}

async function processItemWithRetry(
  profile: ChromeProfile,
  provider: LlmTextProvider,
  item: WhatIfInputItem,
  itemIndex: number,
  total: number,
): Promise<WhatIfPromptResult> {
  const name = `scene_${itemIndex}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    logItem(profile.name, itemIndex, total, attempt, attempt === 1 ? 'started' : 'retry');

    try {
      const step1Prompt = promptStep1(item.title, item.description);
      const step1Res = await llmBrowserService.chat(profile.id, provider, step1Prompt, undefined, {
        submitWith: 'enter',
        pasteStrategy: 'human',
      });

      const scene = parseWhatIfStep1Scene(step1Res);
      if (!scene) {
        console.warn(
          `[whatif] item ${itemIndex}/${total} attempt ${attempt}: step1 invalid JSON or missing scene`,
        );
        continue;
      }

      const step2Prompt = promptStep2(scene);
      const step2Res = await llmBrowserService.chat(profile.id, provider, step2Prompt, undefined, {
        submitWith: 'enter',
        pasteStrategy: 'human',
      });

      const imagePrompt = extractImagePrompt(step2Res);
      if (!imagePrompt) {
        console.warn(`[whatif] item ${itemIndex}/${total} attempt ${attempt}: step2 empty prompt`);
        continue;
      }

      logItem(profile.name, itemIndex, total, attempt, 'ok');
      return { name, prompt: imagePrompt };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.warn(`[whatif] item ${itemIndex}/${total} attempt ${attempt}: ${detail}`);
    }
  }

  logItem(profile.name, itemIndex, total, MAX_RETRIES, 'fallback');
  return { name, prompt: '' };
}

export async function generateWhatIfPrompts(
  items: WhatIfInputItem[] = data,
): Promise<WhatIfPromptResult[]> {
  if (items.length === 0) {
    console.warn('[whatif] data array is empty');
    return [];
  }

  const total = items.length;
  const provider = promptsSettingsService.get().defaultLlmProvider;
  const workerCount = Math.min(MAX_CONCURRENT_PROFILES, total);
  const profiles = chromeProfilesService.pickSubProfiles(workerCount);

  console.log(
    `[whatif] Mở ${workerCount} Chrome profile cho ${total} item (${profiles.map(p => p.name).join(', ')})...`,
  );

  const results: WhatIfPromptResult[] = new Array(total);
  let nextItemIndex = 0;

  try {
    async function workerProfile(profile: ChromeProfile): Promise<void> {
      await llmBrowserService.open(profile.id, provider);

      while (true) {
        const index = nextItemIndex++;
        if (index >= total) break;

        console.log(`[whatif] profile ${profile.name} processing item ${index + 1}/${total}`);

        results[index] = await processItemWithRetry(profile, provider, items[index], index + 1, total);

        if (nextItemIndex < total) {
          await sleep(ITEM_DELAY_MS);
        }
      }
    }

    await Promise.all(profiles.map(workerProfile));
  } finally {
    await chromeProfilesService.closeAllSubProfiles();
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(results, null, 2), 'utf8');
  console.log(`[whatif] done: ${results.length} results → ${OUTPUT_PATH}`);

  return results;
}

async function main(): Promise<void> {
  ensureDataDirs();
  await generateWhatIfPrompts();
}

main().catch(err => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[whatif] failed: ${message}`);
  process.exitCode = 1;
});
