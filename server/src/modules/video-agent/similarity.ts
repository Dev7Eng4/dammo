/** Punctuation and whitespace carry no authorship signal; drop them before comparing. */
function normalize(text: string): string {
  return text.replace(/[\s、。，．,.!?！？「」『』（）()【】・…ー〜~"'“”‘’\-]/g, '');
}

function grams(text: string, n: number): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i + n <= text.length; i++) set.add(text.slice(i, i + n));
  return set;
}

/**
 * Share (%) of `candidate`'s character n-grams that also occur in `source`.
 * Measured on the reference channel: a deep rewrite sits near 3% at n=8 and ~0% at n=15,
 * while an unrelated video in the same niche scores ~0.7% at n=8.
 */
export function ngramContainment(candidate: string, source: string, n: number): number {
  const a = grams(normalize(candidate), n);
  if (a.size === 0) return 0;
  const b = grams(normalize(source), n);
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared++;
  return Math.round((shared / a.size) * 1000) / 10;
}

export const SIMILARITY_LIMITS = { gram8: 5, gram15: 0.5 } as const;
