import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promptTemplateFile, paths } from '../../config/paths.js';
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

async function resolveExistingPromptFilePath(language: PromptLanguage, key: string): Promise<string> {
  const candidates = language === 'all'
    ? [promptTemplateFile('all', key)]
    : [promptTemplateFile(language, key), promptTemplateFile('all', key)];

  for (const filePath of candidates) {
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      // try next candidate
    }
  }

  throw new AppError('Prompt template file not found', 404, 'PROMPT_FILE_NOT_FOUND');
}

export async function readPromptSource(language: PromptLanguage, key: string): Promise<string> {
  const filePath = await resolveExistingPromptFilePath(language, key);
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('Prompt template file not found', 404, 'PROMPT_FILE_NOT_FOUND');
  }

  const expression = extractExportExpression(content);
  const plainString = unwrapPlainStringWrapper(expression);
  if (plainString !== null) return plainString;

  return expression;
}

export async function executePromptTemplate(
  language: PromptLanguage,
  key: string,
  args: unknown[] = [],
): Promise<string> {
  const filePath = await resolveExistingPromptFilePath(language, key);

  try {
    const module = await import(`${pathToFileURL(filePath).href}?t=${Date.now()}`);
    const factory = module.default ?? module[key];
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

export async function writePromptFile(
  language: PromptLanguage,
  key: string,
  template: string,
): Promise<string> {
  const filePath = promptTemplateFile(language, key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const parsed = parseTemplateInput(template);
  await fs.writeFile(filePath, buildPromptFileContent(parsed), 'utf8');
  return filePath;
}

async function removeEmptyPromptDir(filePath: string): Promise<void> {
  // Only for …/prompts/{lang}/{base}/step-*.js — never remove …/prompts/{lang}
  const promptDir = path.dirname(filePath);
  const langDir = path.dirname(promptDir);
  if (path.dirname(langDir) !== paths.promptsDir) return;

  try {
    const entries = await fs.readdir(promptDir);
    if (entries.length === 0) {
      await fs.rmdir(promptDir);
    }
  } catch {
    // ignore missing / non-empty
  }
}

export async function deletePromptFile(language: PromptLanguage, key: string): Promise<void> {
  const filePath = promptTemplateFile(language, key);
  try {
    await fs.unlink(filePath);
  } catch {
    // ignore missing file
  }
  await removeEmptyPromptDir(filePath);
}

export async function movePromptFile(
  fromLanguage: PromptLanguage,
  fromKey: string,
  toLanguage: PromptLanguage,
  toKey: string,
  template?: string,
): Promise<void> {
  const fromPath = promptTemplateFile(fromLanguage, fromKey);
  const toPath = promptTemplateFile(toLanguage, toKey);

  if (fromPath === toPath) {
    if (template !== undefined) {
      await writePromptFile(toLanguage, toKey, template);
    }
    return;
  }

  if (template !== undefined) {
    await writePromptFile(toLanguage, toKey, template);
    await deletePromptFile(fromLanguage, fromKey);
    return;
  }

  try {
    await fs.access(fromPath);
    await fs.mkdir(path.dirname(toPath), { recursive: true });
    await fs.rename(fromPath, toPath);
    await removeEmptyPromptDir(fromPath);
  } catch {
    throw new AppError('Prompt template file not found', 404, 'PROMPT_FILE_NOT_FOUND');
  }
}

export async function ensurePromptsDir(): Promise<void> {
  await fs.mkdir(paths.promptsDir, { recursive: true });
}
