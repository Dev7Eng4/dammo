export function inferNiche(categories?: string[], description?: string): string {
  if (categories?.length) {
    return categories[0];
  }

  if (description?.trim()) {
    const firstLine = description.trim().split('\n')[0]?.trim();
    if (firstLine && firstLine.length <= 50) {
      return firstLine;
    }
  }

  return 'General';
}
