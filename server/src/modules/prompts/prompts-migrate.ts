import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { paths, promptSetStepTemplateFile, promptTemplateFile } from '../../config/paths.js';
import { generateId } from '../../shared/id.js';
import type {
  PromptCategory,
  PromptLanguage,
  PromptOutputType,
  PromptSet,
  PromptStep,
  PromptsStore,
} from './prompts.types.js';

/** Legacy flat prompt shape in prompts.json before migration. */
interface LegacyPrompt {
  id: string;
  key: string;
  language: PromptLanguage;
  name: string;
  category: PromptCategory;
  outputType?: PromptOutputType;
  description?: string;
  isSystem?: boolean;
  useReferenceImage?: boolean;
  useChannelBackgroundImage?: boolean;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_KEYS_BY_CATEGORY: Partial<Record<PromptCategory, string[]>> = {
  transcript: ['update_transcript'],
  meta: ['metadata'],
  thumbnail: ['recreate'],
  image: ['video_image', 'general'],
};

function stepOrderFromKey(key: string): number | null {
  const match = key.match(/_step_(\d+)$/i);
  if (!match) return null;
  return Math.max(0, Number(match[1]) - 1);
}

function canonicalKeyFromLegacy(key: string, name: string): string {
  const withoutStep = key.replace(/_step_\d+$/i, '');
  if (withoutStep !== key) return withoutStep;
  return key || name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function moveLegacyTemplateToStep(
  language: PromptLanguage,
  legacyKey: string,
  setKey: string,
  stepOrder: number,
): void {
  const fromPath = promptTemplateFile(language, legacyKey);
  const toPath = promptSetStepTemplateFile(language, setKey, stepOrder);
  if (!fs.existsSync(fromPath)) {
    // Already migrated or missing
    if (fs.existsSync(toPath)) return;
    return;
  }
  fs.mkdirSync(path.dirname(toPath), { recursive: true });
  if (fs.existsSync(toPath)) {
    // Prefer existing step file; remove legacy flat file
    try {
      fs.unlinkSync(fromPath);
    } catch {
      /* ignore */
    }
    return;
  }
  fs.renameSync(fromPath, toPath);
}

function buildStepFromLegacy(prompt: LegacyPrompt, order: number): PromptStep {
  return {
    id: generateId(),
    order,
    name: prompt.name,
    outputType: prompt.outputType ?? 'text',
    templateParams: [],
    ...(prompt.useReferenceImage ? { useReferenceImage: true } : {}),
    ...(prompt.useChannelBackgroundImage ? { useChannelBackgroundImage: true } : {}),
  };
}

/**
 * Migrate legacy `{ prompts: Prompt[] }` → `{ promptSets: PromptSet[] }`.
 * Groups same (language, category, name) into multi-step sets when keys use `_step_N`.
 */
export function migrateLegacyPromptsToSets(legacyPrompts: LegacyPrompt[]): PromptSet[] {
  type Group = { prompts: LegacyPrompt[]; setKey: string };
  const groups = new Map<string, Group>();

  for (const prompt of legacyPrompts) {
    const groupKey = `${prompt.language}::${prompt.category}::${prompt.name.trim().toLowerCase()}`;
    const setKey = canonicalKeyFromLegacy(prompt.key, prompt.name);
    const existing = groups.get(groupKey);
    if (existing) {
      existing.prompts.push(prompt);
    } else {
      groups.set(groupKey, { prompts: [prompt], setKey });
    }
  }

  const sets: PromptSet[] = [];
  const defaultClaimed = new Set<string>(); // language::category

  for (const { prompts: groupPrompts, setKey } of groups.values()) {
    const sorted = [...groupPrompts].sort((a, b) => {
      const ao = stepOrderFromKey(a.key) ?? 0;
      const bo = stepOrderFromKey(b.key) ?? 0;
      return ao - bo || a.key.localeCompare(b.key);
    });

    const primary = sorted[0];
    const steps: PromptStep[] = sorted.map((p, index) => {
      const order = stepOrderFromKey(p.key) ?? index;
      moveLegacyTemplateToStep(p.language, p.key, setKey, order);
      return buildStepFromLegacy(p, order);
    });

    // Normalize orders to 0..n-1 contiguous
    steps.sort((a, b) => a.order - b.order);
    steps.forEach((step, index) => {
      if (step.order !== index) {
        const from = promptSetStepTemplateFile(primary.language, setKey, step.order);
        const to = promptSetStepTemplateFile(primary.language, setKey, index);
        if (fs.existsSync(from) && from !== to) {
          fs.mkdirSync(path.dirname(to), { recursive: true });
          if (!fs.existsSync(to)) fs.renameSync(from, to);
        }
        step.order = index;
      }
    });

    const defaultSlot = `${primary.language}::${primary.category}`;
    const preferredKeys = DEFAULT_KEYS_BY_CATEGORY[primary.category] ?? [];
    const shouldDefault =
      !defaultClaimed.has(defaultSlot) &&
      (preferredKeys.includes(setKey) || preferredKeys.includes(primary.key) || primary.isSystem === true);

    if (shouldDefault) defaultClaimed.add(defaultSlot);

    sets.push({
      id: primary.id,
      key: setKey,
      name: primary.name,
      language: primary.language,
      category: primary.category,
      ...(primary.description ? { description: primary.description } : {}),
      ...(primary.isSystem ? { isSystem: true } : {}),
      ...(shouldDefault ? { isDefault: true } : {}),
      steps,
      createdAt: primary.createdAt,
      updatedAt: primary.updatedAt,
    });
  }

  // Ensure one default per (language, category) when none claimed via preferred keys
  const bySlot = new Map<string, PromptSet[]>();
  for (const set of sets) {
    const slot = `${set.language}::${set.category}`;
    const list = bySlot.get(slot) ?? [];
    list.push(set);
    bySlot.set(slot, list);
  }
  for (const [, list] of bySlot) {
    if (!list.some(s => s.isDefault)) {
      list[0].isDefault = true;
    }
  }

  return sets;
}

export function isLegacyPromptsStore(raw: unknown): raw is { prompts: LegacyPrompt[] } {
  if (!raw || typeof raw !== 'object') return false;
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.promptSets)) return false;
  return Array.isArray(obj.prompts);
}

export async function backupPromptsJson(): Promise<void> {
  const src = paths.prompts;
  if (!fs.existsSync(src)) return;
  const dest = path.join(path.dirname(src), `prompts.legacy-backup.${Date.now()}.json`);
  await fsp.copyFile(src, dest);
}

export type { LegacyPrompt };
