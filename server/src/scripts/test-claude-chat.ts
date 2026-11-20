/**
 * Try the Claude (claude.ai) chat flow on a Chrome profile with Claude ticked in LLM Content:
 * open https://claude.ai/new → paste the prompt → Enter → wait for and print the reply.
 *
 *   npm run test:claude-chat -- --prompt "Reply with exactly: OK"
 *   npm run test:claude-chat -- --prompt "First" --prompt "Second"   # several prompts in the same chat
 *   npm run test:claude-chat -- --inspect          # only open claude.ai and check the selectors, sends nothing
 *   npm run test:claude-chat -- --profile "meta"   # profile name or id (default: first with Claude ticked)
 *   npm run test:claude-chat -- --keep-open        # leave Chrome open afterwards
 *   npm run test:claude-chat -- --dom              # also print the latest reply's DOM (to fix selectors)
 */
import { ensureDataDirs } from '../config/paths.js';
import { getChromeProfilePage } from '../modules/chrome-profiles/chrome-profile.runner.js';
import { chromeProfilesService, profileHasLlm } from '../modules/chrome-profiles/chrome-profiles.service.js';
import type { ChromeProfile } from '../modules/chrome-profiles/chrome-profiles.types.js';
import { getLlmProviderConfig } from '../modules/llm-browser/text/text.config.js';
import { llmBrowserService } from '../modules/llm-browser/text/text.service.js';

const DEFAULT_PROMPT = 'Reply with exactly one word: OK';

interface CliOptions {
  profile?: string;
  prompts: string[];
  inspect: boolean;
  keepOpen: boolean;
  dom: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { prompts: [], inspect: false, keepOpen: false, dom: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--profile') options.profile = argv[++index];
    else if (arg === '--prompt') options.prompts.push(argv[++index] ?? DEFAULT_PROMPT);
    else if (arg === '--inspect') options.inspect = true;
    else if (arg === '--keep-open') options.keepOpen = true;
    else if (arg === '--dom') options.dom = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function resolveProfile(nameOrId: string | undefined): ChromeProfile {
  if (!nameOrId) return chromeProfilesService.requireProfileForLlm('content', 'claude');
  const wanted = nameOrId.trim().toLowerCase();
  const profile = chromeProfilesService
    .list()
    .items.find(item => item.id === nameOrId || item.name.trim().toLowerCase() === wanted);
  if (!profile) throw new Error(`Chrome profile not found: ${nameOrId}`);
  if (!profileHasLlm(profile, 'content', 'claude')) {
    console.warn(`[claude-test] ${profile.name} does not have Claude ticked in LLM Content — trying anyway`);
  }
  return profile;
}

/** Print how many elements each Claude selector matches on the open page. */
async function inspectSelectors(profileId: string, dumpDom: boolean): Promise<void> {
  const page = await getChromeProfilePage(profileId);
  const { selectors } = getLlmProviderConfig('claude');
  console.log(`[claude-test] url: ${page.url()}`);
  for (const [name, selector] of Object.entries(selectors) as [string, string | undefined][]) {
    if (!selector) continue;
    const parts = selector.split(',').map(part => part.trim());
    const counts = await Promise.all(parts.map(part => page.locator(part).count().catch(() => -1)));
    console.log(`  ${name.padEnd(28)} ${parts.map((part, i) => `${part} → ${counts[i]}`).join(' | ')}`);
  }

  if (!dumpDom) return;
  // Skeleton of the latest reply, to find where the reply text lives.
  const blocks = page.locator(selectors.responseBlocks);
  const count = await blocks.count();
  if (count === 0) return;
  // No named functions inside evaluate: tsx would wrap them with a `__name` helper the page doesn't have.
  const skeleton = await blocks.nth(count - 1).evaluate(root => {
    const lines: string[] = [];
    const stack: Array<[Element, number]> = [[root, 0]];
    while (stack.length > 0 && lines.length < 150) {
      const [el, depth] = stack.pop()!;
      const cls = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 6).join('.');
      const attrs = ['data-testid', 'data-is-streaming', 'aria-label', 'role']
        .map(name => (el.hasAttribute(name) ? ` ${name}="${el.getAttribute(name)}"` : ''))
        .join('');
      const ownText = [...el.childNodes]
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent?.trim())
        .filter(Boolean)
        .join(' ')
        .slice(0, 40);
      lines.push(`${'  '.repeat(depth)}<${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${attrs}>${ownText ? ` "${ownText}"` : ''}`);
      if (depth < 12) {
        const children = [...el.children];
        for (let i = children.length - 1; i >= 0; i -= 1) stack.push([children[i]!, depth + 1]);
      }
    }
    return lines.join('\n');
  });
  console.log(`[claude-test] latest reply DOM:\n${skeleton}`);
}

async function main(): Promise<void> {
  ensureDataDirs();
  const options = parseArgs(process.argv.slice(2));
  const profile = resolveProfile(options.profile);
  console.log(`[claude-test] profile: ${profile.name} (${profile.id})`);

  try {
    await llmBrowserService.open(profile.id, 'claude');
    console.log('[claude-test] claude.ai is open and the prompt box is visible');

    if (options.inspect) {
      await inspectSelectors(profile.id, options.dom);
      return;
    }

    const prompts = options.prompts.length > 0 ? options.prompts : [DEFAULT_PROMPT];
    for (const [turn, prompt] of prompts.entries()) {
      console.log(`[claude-test] turn ${turn + 1}/${prompts.length} sending: ${prompt}`);
      const response = await llmBrowserService.chat(profile.id, 'claude', prompt, undefined, {
        submitWith: 'enter',
      });
      console.log(`[claude-test] reply after ${(response.elapsedMs / 1000).toFixed(1)}s:\n${response.content}`);
      if (response.codeBlocks?.length) {
        console.log(`[claude-test] ${response.codeBlocks.length} code block(s):`);
        response.codeBlocks.forEach((block, i) => console.log(`--- #${i + 1}\n${block}`));
      }
    }
    await inspectSelectors(profile.id, options.dom);
  } finally {
    if (!options.keepOpen) await chromeProfilesService.closeProfiles([profile.id]);
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
