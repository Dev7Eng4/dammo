import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildPromptFileContent, parseTemplateInput } from './prompts.file-store.js';

function roundTrip(input: string): string {
  return buildPromptFileContent(parseTemplateInput(input));
}

describe('parseTemplateInput + buildPromptFileContent', () => {
  test('wraps plain string template with export default arrow function', () => {
    const output = roundTrip('Hello ${name}');
    assert.equal(output, 'export default () => `Hello \\${name}`;\n');
  });

  test('wraps function expression without duplicate export default', () => {
    const input = '(fullTranscript) => `Analyze: ${fullTranscript}`';
    const output = roundTrip(input);
    assert.equal(output, `export default ${input};\n`);
    assert.doesNotMatch(output, /export default export default/);
  });

  test('strips export default from pasted function template', () => {
    const input = 'export default (fullTranscript) => `Analyze: ${fullTranscript}`';
    const output = roundTrip(input);
    assert.equal(output, 'export default (fullTranscript) => `Analyze: ${fullTranscript}`;\n');
    assert.doesNotMatch(output, /export default export default/);
  });

  test('heals double export default prefix', () => {
    const input = 'export default export default (x) => `body`';
    const output = roundTrip(input);
    assert.equal(output, 'export default (x) => `body`;\n');
  });
});
