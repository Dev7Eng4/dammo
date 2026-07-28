import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  paths,
  promptSetDir,
  promptSetStepTemplateFile,
  promptTemplateFile,
} from '../../config/paths.js';
import { AppError } from '../../shared/http/errors.js';
import type { PromptLanguage } from './prompts.types.js';

export type ParsedTemplate =
  | { kind: 'string'; value: string }
  | { kind: 'function'; expression: string };

function escapeTemplateForJs(template: string): string {
  return template.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function unescapeTemplateFromJs(template: string): string {
  return template.replace(/\\\$/g, '$').replace(/\\`/g, '`').replace(/\\\\/g, '\\');
}

function trimTrailingSemicolon(value: string): string {
  return value.trim().replace(/;+\s*$/, '');
}

function isFunctionExpression(expression: string): boolean {
  const trimmed = trimTrailingSemicolon(expression);
  if (/^function\b/.test(trimmed)) return true;
  if (/^async\s+function\b/.test(trimmed)) return true;
  if (/^async\s*\(/.test(trimmed)) return true;
  return /=>/.test(trimmed);
}

export function parseTemplateInput(input: string): ParsedTemplate {
  const trimmed = input.trim();

  const exportConstMatch = trimmed.match(/^export\s+const\s+\w+\s*=\s*([\s\S]+)$/);
  if (exportConstMatch) {
    const expression = trimTrailingSemicolon(exportConstMatch[1]);
    if (isFunctionExpression(expression)) {
      return { kind: 'function', expression };
    }
  }

  const constMatch = trimmed.match(/^const\s+\w+\s*=\s*([\s\S]+)$/);
  if (constMatch) {
    const expression = trimTrailingSemicolon(constMatch[1]);
    if (isFunctionExpression(expression)) {
      return { kind: 'function', expression };
    }
  }

  if (isFunctionExpression(trimmed)) {
    return { kind: 'function', expression: trimTrailingSemicolon(trimmed) };
  }

  return { kind: 'string', value: input };
}

export function buildPromptFileContent(parsed: ParsedTemplate): string {
  if (parsed.kind === 'function') {
    return `export default ${parsed.expression};\n`;
  }
  return `export default () => \`${escapeTemplateForJs(parsed.value)}\`;\n`;
}

function unwrapPlainStringWrapper(expression: string): string | null {
  const trimmed = trimTrailingSemicolon(expression);
  const arrowMatch = trimmed.match(/^\(\)\s*=>\s*`([\s\S]*)`$/);
  if (!arrowMatch) return null;
  return unescapeTemplateFromJs(arrowMatch[1]);
}

function extractExportExpression(content: string): string {
  const trimmed = content.trim();

  const defaultMatch = trimmed.match(/^export\s+default\s+([\s\S]+?);?\s*$/);
  if (defaultMatch) return trimTrailingSemicolon(defaultMatch[1]);

  const legacyMatch = trimmed.match(/^export\s+const\s+\w+\s*=\s*([\s\S]+?);?\s*$/);
  if (legacyMatch) return trimTrailingSemicolon(legacyMatch[1]);

  throw new AppError('Invalid prompt template file format', 500, 'PROMPT_EXPORT_INVALID');
}

async function readTemplateFile(filePath: string): Promise<string> {
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch {
    throw new AppError('Prompt template file not found', 404, 'PROMPT_FILE_NOT_FOUND');
  }

  const expression = extractExportExpression(content);
  const plainString = unwrapPlainStringWrapper(expression);
  if (plainString !== null) return plainString;
  return expression;
}

async function executeTemplateFile(filePath: string, keyHint: string, args: unknown[]): Promise<string> {
  try {
    await fs.access(filePath);
  } catch {
    throw new AppError('Prompt template file not found', 404, 'PROMPT_FILE_NOT_FOUND');
  }

  try {
    const module = await import(`${pathToFileURL(filePath).href}?t=${Date.now()}`);
    const factory = module.default ?? module[keyHint];
    if (typeof factory !== 'function') {
      throw new AppError('Prompt default export not found in template file', 500, 'PROMPT_EXPORT_INVALID');
    }
    const template = factory(...args);
    if (typeof template !== 'string') {
      throw new AppError('Prompt template must return a string', 500, 'PROMPT_EXPORT_INVALID');
    }
    return template;
  } catch (err) {
    if (err instanceof AppError) throw err;
    const detail = err instanceof Error ? err.message : 'Unknown error';
    throw new AppError(`Failed to load prompt template: ${detail}`, 500, 'PROMPT_LOAD_FAILED');
  }
}

export async function readPromptSetStepSource(
  language: PromptLanguage,
  setKey: string,
  stepOrder: number,
): Promise<string> {
  const stepPath = promptSetStepTemplateFile(language, setKey, stepOrder);
  try {
    await fs.access(stepPath);
    return readTemplateFile(stepPath);
  } catch {
    // Legacy flat file fallback (pre-migration)
    return readTemplateFile(promptTemplateFile(language, setKey));
  }
}

/** @deprecated Prefer readPromptSetStepSource */
export async function readPromptSource(language: PromptLanguage, key: string): Promise<string> {
  return readPromptSetStepSource(language, key, 0);
}

export async function executePromptSetStepTemplate(
  language: PromptLanguage,
  setKey: string,
  stepOrder: number,
  args: unknown[] = [],
): Promise<string> {
  const stepPath = promptSetStepTemplateFile(language, setKey, stepOrder);
  try {
    await fs.access(stepPath);
    return executeTemplateFile(stepPath, setKey, args);
  } catch {
    return executeTemplateFile(promptTemplateFile(language, setKey), setKey, args);
  }
}

/** @deprecated Prefer executePromptSetStepTemplate — runs step 0 of set key */
export async function executePromptTemplate(
  language: PromptLanguage,
  key: string,
  args: unknown[] = [],
): Promise<string> {
  return executePromptSetStepTemplate(language, key, 0, args);
}

export async function writePromptSetStepFile(
  language: PromptLanguage,
  setKey: string,
  stepOrder: number,
  template: string,
): Promise<string> {
  const filePath = promptSetStepTemplateFile(language, setKey, stepOrder);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const parsed = parseTemplateInput(template);
  await fs.writeFile(filePath, buildPromptFileContent(parsed), 'utf8');
  return filePath;
}

/** @deprecated */
export async function writePromptFile(
  language: PromptLanguage,
  key: string,
  template: string,
): Promise<string> {
  return writePromptSetStepFile(language, key, 0, template);
}

export async function deletePromptSetStepFile(
  language: PromptLanguage,
  setKey: string,
  stepOrder: number,
): Promise<void> {
  const filePath = promptSetStepTemplateFile(language, setKey, stepOrder);
  try {
    await fs.unlink(filePath);
  } catch {
    /* ignore */
  }
}

export async function deletePromptSetDir(language: PromptLanguage, setKey: string): Promise<void> {
  const dir = promptSetDir(language, setKey);
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  // Also remove legacy flat file if present
  try {
    await fs.unlink(promptTemplateFile(language, setKey));
  } catch {
    /* ignore */
  }
}

/** @deprecated */
export async function deletePromptFile(language: PromptLanguage, key: string): Promise<void> {
  await deletePromptSetDir(language, key);
}

export async function movePromptSetDir(
  fromLanguage: PromptLanguage,
  fromKey: string,
  toLanguage: PromptLanguage,
  toKey: string,
): Promise<void> {
  const fromDir = promptSetDir(fromLanguage, fromKey);
  const toDir = promptSetDir(toLanguage, toKey);

  if (fromDir === toDir) return;

  try {
    await fs.access(fromDir);
    await fs.mkdir(path.dirname(toDir), { recursive: true });
    await fs.rename(fromDir, toDir);
  } catch {
    // Try legacy flat → step-0
    const fromFlat = promptTemplateFile(fromLanguage, fromKey);
    try {
      await fs.access(fromFlat);
      await writePromptSetStepFile(
        toLanguage,
        toKey,
        0,
        await readTemplateFile(fromFlat),
      );
      await fs.unlink(fromFlat);
    } catch {
      throw new AppError('Prompt template file not found', 404, 'PROMPT_FILE_NOT_FOUND');
    }
  }
}

/** @deprecated */
export async function movePromptFile(
  fromLanguage: PromptLanguage,
  fromKey: string,
  toLanguage: PromptLanguage,
  toKey: string,
  template?: string,
): Promise<void> {
  if (template !== undefined) {
    await writePromptSetStepFile(toLanguage, toKey, 0, template);
    if (fromLanguage !== toLanguage || fromKey !== toKey) {
      await deletePromptSetDir(fromLanguage, fromKey);
    }
    return;
  }
  await movePromptSetDir(fromLanguage, fromKey, toLanguage, toKey);
}

export async function ensurePromptsDir(): Promise<void> {
  await fs.mkdir(paths.promptsDir, { recursive: true });
}
