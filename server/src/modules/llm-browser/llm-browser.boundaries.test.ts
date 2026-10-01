import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PROVIDERS = ['flow', 'meta', 'text'] as const;

function listTsFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listTsFiles(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : [];
  });
}

function relativeImports(file: string): string[] {
  const source = fs.readFileSync(file, 'utf8');
  return [...source.matchAll(/from '(\.{1,2}\/[^']+)'/g)].map(match => match[1]!);
}

describe('llm-browser layout', () => {
  for (const provider of PROVIDERS) {
    test(`${provider}/ does not import another provider folder`, () => {
      const dir = path.join(ROOT, provider);
      const others = PROVIDERS.filter(name => name !== provider);

      for (const file of listTsFiles(dir)) {
        for (const spec of relativeImports(file)) {
          const target = path.relative(ROOT, path.resolve(path.dirname(file), spec)).split(path.sep)[0];
          assert.ok(
            !others.includes(target as (typeof PROVIDERS)[number]),
            `${path.relative(ROOT, file)} imports "${spec}" from another provider folder`,
          );
        }
      }
    });
  }

  test('core/ only imports providers from registry.ts (composition root)', () => {
    for (const file of listTsFiles(path.join(ROOT, 'core'))) {
      if (path.basename(file) === 'registry.ts') continue;
      for (const spec of relativeImports(file)) {
        const target = path.relative(ROOT, path.resolve(path.dirname(file), spec)).split(path.sep)[0];
        assert.ok(
          !PROVIDERS.includes(target as (typeof PROVIDERS)[number]),
          `${path.relative(ROOT, file)} imports "${spec}" from a provider folder`,
        );
      }
    }
  });
});
