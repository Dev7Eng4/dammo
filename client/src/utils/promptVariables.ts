import type { Prompt, PromptLanguage } from '../types/prompt';

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
const DOLLAR_VARIABLE_PATTERN = /\$\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}/g;
const IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const MANAGED_TEMPLATE_PATTERN =
  /^(?:\(([^)]*)\)|([a-zA-Z_][a-zA-Z0-9_]*))\s*=>\s*`([\s\S]*)`$/;

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

function unescapeTemplateLiteralBody(body: string): string {
  return body.replace(/\\\$/g, '$').replace(/\\`/g, '`').replace(/\\\\/g, '\\');
}

function escapeBodyForTemplateLiteral(body: string): string {
  return body.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
}

function parseParamList(raw: string): string[] | null {
  const params = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (params.length === 0) return null;
  if (!params.every((param) => IDENTIFIER_PATTERN.test(param))) return null;
  return params;
}

export interface ManagedTemplate {
  body: string;
  params: string[];
}

export function isFunctionTemplate(template: string): boolean {
  const trimmed = template.trim();
  if (!trimmed) return false;

  const exportConstMatch = trimmed.match(/^export\s+const\s+\w+\s*=\s*([\s\S]+)$/);
  if (exportConstMatch) {
    return isFunctionExpression(exportConstMatch[1]);
  }

  const constMatch = trimmed.match(/^const\s+\w+\s*=\s*([\s\S]+)$/);
  if (constMatch) {
    return isFunctionExpression(constMatch[1]);
  }

  return isFunctionExpression(trimmed);
}

export function parseManagedTemplate(source: string): ManagedTemplate | null {
  const trimmed = trimTrailingSemicolon(source.trim());
  const match = trimmed.match(MANAGED_TEMPLATE_PATTERN);
  if (!match) return null;

  const params = match[1] !== undefined ? parseParamList(match[1]) : parseParamList(match[2] ?? '');
  if (!params) return null;

  return {
    params,
    body: unescapeTemplateLiteralBody(match[3]),
  };
}

export function buildManagedTemplateExpression(body: string, params: string[]): string {
  if (params.length === 0) return body;
  const escapedBody = escapeBodyForTemplateLiteral(body);
  return `(${params.join(', ')}) => \`${escapedBody}\``;
}

export function isUserFunctionTemplate(template: string): boolean {
  const trimmed = template.trim();
  if (!trimmed) return false;
  if (parseManagedTemplate(trimmed)) return false;
  return isFunctionTemplate(trimmed);
}

export function normalizeVariableName(name: string): string | null {
  const normalized = name.trim().replace(/\s+/g, '_');
  if (!IDENTIFIER_PATTERN.test(normalized)) return null;
  return normalized;
}

export function normalizePromptKey(key: string): string {
  return key.trim().toLowerCase();
}

export function derivePromptKeyFromName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .slice(0, 80);

  return base || 'new_prompt';
}

export function deriveUniquePromptKeyFromName(
  name: string,
  language: PromptLanguage,
  prompts: Prompt[],
  excludeId?: string | null,
): string {
  const base = derivePromptKeyFromName(name);
  let candidate = base;
  let index = 2;

  while (findPromptKeyConflict(prompts, candidate, language, excludeId)) {
    candidate = `${base}_${index}`;
    index += 1;
  }

  return candidate;
}

export function findPromptKeyConflict(
  prompts: Prompt[],
  key: string,
  language: PromptLanguage,
  excludeId?: string | null,
): Prompt | undefined {
  const normalized = normalizePromptKey(key);
  if (!normalized) return undefined;
  return prompts.find(
    (prompt) =>
      prompt.key === normalized && prompt.language === language && prompt.id !== excludeId,
  );
}

export function suggestUniquePromptKey(
  baseKey: string,
  language: PromptLanguage,
  prompts: Prompt[],
): string {
  const normalized = normalizePromptKey(baseKey) || 'new_prompt';
  let candidate = `${normalized}_copy`;
  let index = 2;
  while (findPromptKeyConflict(prompts, candidate, language)) {
    candidate = `${normalized}_copy_${index}`;
    index += 1;
  }
  return candidate;
}

export function formatVariableToken(name: string, template: string): string {
  if (template.includes(`\${${name}}`)) {
    return `\${${name}}`;
  }
  return `{{${name}}}`;
}

export function extractTemplateVariables(body: string, templateParams: string[] = []): string[] {
  if (isUserFunctionTemplate(body)) return [];
  if (templateParams.length > 0) return [...templateParams];

  const vars = new Set<string>();
  for (const match of body.matchAll(VARIABLE_PATTERN)) {
    vars.add(match[1]);
  }
  return Array.from(vars);
}

export function extractVariables(template: string): string[] {
  return extractTemplateVariables(template);
}

export function interpolateTemplate(template: string, vars: Record<string, string>): string {
  if (isUserFunctionTemplate(template)) return template;

  return template
    .replace(DOLLAR_VARIABLE_PATTERN, (_, name: string) => vars[name] ?? '')
    .replace(VARIABLE_PATTERN, (_, name: string) => vars[name] ?? '');
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
