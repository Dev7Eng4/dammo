/** Merge multi + single reference path options into a deduped ordered list. */
export function resolveReferenceImagePaths(options?: {
  referenceImagePaths?: string[];
  referenceImagePath?: string;
}): string[] {
  const paths = [
    ...(options?.referenceImagePaths ?? []),
    ...(options?.referenceImagePath ? [options.referenceImagePath] : []),
  ]
    .map(path => path.trim())
    .filter(Boolean);

  return [...new Set(paths)];
}
