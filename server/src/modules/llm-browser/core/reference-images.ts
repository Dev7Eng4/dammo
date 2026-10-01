/** Trim, drop empty entries and dedupe local reference image paths, keeping order. */
export function normalizeReferenceImagePaths(paths?: readonly string[]): string[] {
  const cleaned = (paths ?? []).map(path => path.trim()).filter(Boolean);
  return [...new Set(cleaned)];
}
