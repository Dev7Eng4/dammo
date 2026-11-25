import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveRandomAudioSpeed } from '../render-core/canvas.constants.js';

export const AI_RENDER_CONFIG_FILENAME = 'ai-render-config.json';

export interface AiRenderConfig {
  audioSpeed: number;
  createdAt: string;
  /** Absent on configs written before this field existed. */
  kenBurns?: boolean;
}

export function resolveAiRenderConfigPath(workDir: string): string {
  return path.join(workDir, AI_RENDER_CONFIG_FILENAME);
}

export async function loadAiRenderConfig(workDir: string): Promise<AiRenderConfig> {
  const filePath = resolveAiRenderConfigPath(workDir);
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw) as AiRenderConfig;
  if (typeof parsed.audioSpeed !== 'number' || !Number.isFinite(parsed.audioSpeed)) {
    throw new Error('Invalid ai-render-config.json: missing audioSpeed');
  }
  return parsed;
}

/** Use the saved flag. Old files without `kenBurns` follow `fallback` and are not rewritten. */
export function resolveSavedKenBurns(config: AiRenderConfig, fallback: boolean): boolean {
  return typeof config.kenBurns === 'boolean' ? config.kenBurns : fallback;
}

async function writeAiRenderConfig(workDir: string, config: AiRenderConfig): Promise<void> {
  await fs.mkdir(workDir, { recursive: true });
  await fs.writeFile(resolveAiRenderConfigPath(workDir), JSON.stringify(config, null, 2), 'utf8');
}

/**
 * Resolve once per workDir; reuses existing config on retry. `fixedAudioSpeed` wins over a saved speed
 * (and is written back), so videos prepared with a random speed follow it too.
 */
export async function resolveAiRenderConfig(
  workDir: string,
  options?: { kenBurns: boolean; fixedAudioSpeed?: number },
): Promise<AiRenderConfig> {
  const filePath = resolveAiRenderConfigPath(workDir);
  const fixedAudioSpeed = options?.fixedAudioSpeed;
  try {
    await fs.access(filePath);
  } catch {
    const config: AiRenderConfig = {
      audioSpeed: fixedAudioSpeed ?? resolveRandomAudioSpeed(),
      createdAt: new Date().toISOString(),
      kenBurns: options?.kenBurns ?? false,
    };
    await writeAiRenderConfig(workDir, config);
    return config;
  }

  const saved = await loadAiRenderConfig(workDir);
  if (fixedAudioSpeed == null || saved.audioSpeed === fixedAudioSpeed) return saved;
  const config: AiRenderConfig = { ...saved, audioSpeed: fixedAudioSpeed };
  await writeAiRenderConfig(workDir, config);
  return config;
}
