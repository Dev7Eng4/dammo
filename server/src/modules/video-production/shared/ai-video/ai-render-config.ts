import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveRandomAudioSpeed } from '../render-core/canvas.constants.js';

export const AI_RENDER_CONFIG_FILENAME = 'ai-render-config.json';

export interface AiRenderConfig {
  audioSpeed: number;
  createdAt: string;
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

/** Resolve once per workDir; reuses existing config on retry. */
export async function resolveAiRenderConfig(workDir: string): Promise<AiRenderConfig> {
  const filePath = resolveAiRenderConfigPath(workDir);
  try {
    await fs.access(filePath);
    return loadAiRenderConfig(workDir);
  } catch {
    const config: AiRenderConfig = {
      audioSpeed: resolveRandomAudioSpeed(),
      createdAt: new Date().toISOString(),
    };
    await fs.mkdir(workDir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(config, null, 2), 'utf8');
    return config;
  }
}
