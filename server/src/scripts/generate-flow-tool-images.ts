import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDataDirs, paths } from '../config/paths.js';
import { AppError } from '../shared/http/errors.js';
import { chromeProfilesService } from '../modules/chrome-profiles/chrome-profiles.service.js';
import type { ChromeProfile } from '../modules/chrome-profiles/chrome-profiles.types.js';
import { flowBrowserService } from '../modules/llm-browser/flow-browser.service.js';
import type { FlowToolVisual } from '../infrastructure/llm-browser/llm-browser.types.js';

/**
 * Điền project id (động) tại đây để chạy nhanh qua task, hoặc override bằng --project-id.
 * VD: npm run flow:generate-tool-images -- --project-id <id>
 */
const PROJECT_ID = '37afa1aa-49e0-4d70-9407-bcb84afa09e5';

/**
 * Sửa mảng mẫu tại đây rồi chạy: npm run flow:generate-tool-images -- --project-id <id>
 * Format paste vào tool: [{ prompt, name, references? }]
 */
const SAMPLE_VISUALS: FlowToolVisual[] = [
  {
    name: 'scene-001',
    prompt:
      'A soothing cinematic live-action scene of an elderly Japanese couple drinking green tea beside a window, warm morning light, photorealistic, 16:9',
  },
  {
    name: 'scene-002',
    prompt:
      'Macro shot of fresh wholesome food ingredients on a wooden kitchen table, sunlight through a window, artistic composition, 16:9',
  },
  {
    name: 'scene-003',
    prompt: 'A serene live-action scene of a Japanese couple drinking green tea beside a window, warm morning light, photorealistic, 16:9',
  },
];

const DEFAULT_TIMEOUT_MS = 300_000;

interface CliOptions {
  projectId?: string;
  toolId?: string;
  outputDir?: string;
  inputPath?: string;
  profileId?: string;
  timeoutMs: number;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { timeoutMs: DEFAULT_TIMEOUT_MS };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--project-id') {
      options.projectId = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--tool-id') {
      options.toolId = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--output-dir' || arg === '-o') {
      options.outputDir = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--input' || arg === '-i') {
      options.inputPath = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--profile-id') {
      options.profileId = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--timeout-ms') {
      const value = Number(argv[index + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error('--timeout-ms must be a positive number');
      }
      options.timeoutMs = value;
      index += 1;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function normalizeVisuals(raw: unknown): FlowToolVisual[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { visuals?: unknown }).visuals)
      ? (raw as { visuals: unknown[] }).visuals
      : null;

  if (!list) {
    throw new AppError('Input must be an array of [{ prompt, name, references? }]', 400, 'INVALID_INPUT');
  }

  return list.map((item, idx) => {
    if (!item || typeof item !== 'object') {
      throw new AppError(`Visual at index ${idx} is not an object`, 400, 'INVALID_INPUT');
    }
    const { name, prompt, references } = item as {
      name?: unknown;
      prompt?: unknown;
      references?: unknown;
    };
    if (typeof name !== 'string' || !name.trim()) {
      throw new AppError(`Visual at index ${idx} is missing a valid "name"`, 400, 'INVALID_INPUT');
    }
    if (typeof prompt !== 'string' || !prompt.trim()) {
      throw new AppError(`Visual "${name}" is missing a valid "prompt"`, 400, 'INVALID_INPUT');
    }

    const visual: FlowToolVisual = { name: name.trim(), prompt: prompt.trim() };

    if (references !== undefined) {
      if (!Array.isArray(references) || references.some(ref => typeof ref !== 'string')) {
        throw new AppError(`Visual "${name}" has invalid "references" (expected string[])`, 400, 'INVALID_INPUT');
      }
      const cleaned = references.map(ref => ref.trim()).filter(Boolean);
      if (cleaned.length > 0) visual.references = cleaned;
    }

    return visual;
  });
}

async function resolveVisuals(inputPath?: string): Promise<FlowToolVisual[]> {
  if (!inputPath) {
    return SAMPLE_VISUALS;
  }

  const content = await fs.readFile(path.resolve(inputPath), 'utf-8');
  return normalizeVisuals(JSON.parse(content));
}

function resolveFlowProfile(profileId?: string): ChromeProfile {
  if (profileId) {
    const profile = chromeProfilesService.getById(profileId);
    if (profile.role !== 'main') {
      throw new AppError('Google Flow requires the main Chrome profile', 400, 'MAIN_PROFILE_REQUIRED');
    }
    return profile;
  }
  return chromeProfilesService.requireMainProfile();
}

function resolveOutputDir(outputDir?: string): string {
  if (outputDir) {
    return path.resolve(outputDir);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(paths.mediaDownloadsDir, 'flow-tool-test', timestamp);
}

async function main() {
  ensureDataDirs();

  const options = parseArgs(process.argv.slice(2));
  const projectId = (options.projectId ?? PROJECT_ID).trim();
  if (!projectId) {
    throw new AppError('Missing project id — pass --project-id <id> or set PROJECT_ID in the script', 400, 'INVALID_INPUT');
  }

  const visuals = await resolveVisuals(options.inputPath);
  const outputDir = resolveOutputDir(options.outputDir);
  const profile = resolveFlowProfile(options.profileId);

  await fs.mkdir(outputDir, { recursive: true });

  console.log(`Profile: ${profile.name} (${profile.id})`);
  console.log(`Project: ${projectId}`);
  console.log(`Output dir: ${outputDir}`);
  console.log(`Visuals: ${visuals.length}`);
  console.log('Generating images via Flow tool...');

  const response = await flowBrowserService.generateImagesViaTool(profile.id, visuals, {
    projectId,
    toolId: options.toolId,
    outputDir,
    timeoutMs: options.timeoutMs,
  });

  const saved = response.mediaAssets?.map(asset => asset.localPath).filter(Boolean) ?? [];
  console.log(`Saved ${saved.length} image(s):`);
  for (const savedPath of saved) {
    console.log(`  - ${savedPath}`);
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
