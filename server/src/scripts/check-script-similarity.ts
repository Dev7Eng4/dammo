import fs from 'node:fs/promises';
import { ngramContainment, SIMILARITY_LIMITS } from '../modules/video-agent/similarity.js';

/**
 * Same wording-similarity gate the video agent applies, for scripts written by hand.
 * Usage: pnpm --filter server video-agent:similarity <script.txt> <source1.txt> [source2.txt ...]
 */
async function main() {
  const [scriptPath, ...sourcePaths] = process.argv.slice(2);
  if (!scriptPath || sourcePaths.length === 0) {
    console.error('Usage: video-agent:similarity <script.txt> <source1.txt> [source2.txt ...]');
    process.exit(1);
  }

  const script = await fs.readFile(scriptPath, 'utf8');
  console.log(`Script: ${script.replace(/\s/g, '').length} chars`);
  let pass = true;
  for (const sourcePath of sourcePaths) {
    const source = await fs.readFile(sourcePath, 'utf8');
    const gram8 = ngramContainment(script, source, 8);
    const gram15 = ngramContainment(script, source, 15);
    const ok = gram8 <= SIMILARITY_LIMITS.gram8 && gram15 <= SIMILARITY_LIMITS.gram15;
    pass &&= ok;
    console.log(`${sourcePath}: 8-gram ${gram8}% · 15-gram ${gram15}% → ${ok ? 'PASS' : 'FAIL'}`);
  }
  console.log(
    `Limits: 8-gram ≤ ${SIMILARITY_LIMITS.gram8}%, 15-gram ≤ ${SIMILARITY_LIMITS.gram15}% → ${pass ? 'PASS' : 'FAIL'}`,
  );
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
