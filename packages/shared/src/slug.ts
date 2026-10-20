/** Lowercase, ASCII, hyphen-separated slug used for categories, tags, and export filenames. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/** Normalize model-suggested tags: slugify, drop empties and duplicates, cap the count. */
export function normalizeTags(tags: readonly string[], max: number): string[] {
  const seen = new Set<string>();
  for (const tag of tags) {
    const slug = slugify(tag);
    if (slug && !seen.has(slug)) seen.add(slug);
    if (seen.size >= max) break;
  }
  return [...seen];
}

/**
 * Pick an existing category that matches the suggestion, so the taxonomy doesn't fill up with near-duplicates
 * like "Dev Tools" vs "Developer Tools". Returns null when nothing is close enough.
 */
export function matchCategory(suggested: string, existing: readonly string[]): string | null {
  const target = slugify(suggested);
  if (!target) return null;
  let best: { name: string; score: number } | null = null;
  for (const name of existing) {
    const slug = slugify(name);
    if (slug === target) return name;
    const score = similarity(slug, target);
    if (score >= 0.8 && (!best || score > best.score)) best = { name, score };
  }
  return best?.name ?? null;
}

/** Dice coefficient over character bigrams, 0..1. */
function similarity(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const bigrams = (s: string) => {
    const map = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      map.set(bg, (map.get(bg) ?? 0) + 1);
    }
    return map;
  };
  const left = bigrams(a);
  const right = bigrams(b);
  let overlap = 0;
  for (const [bg, count] of left) overlap += Math.min(count, right.get(bg) ?? 0);
  return (2 * overlap) / (a.length - 1 + b.length - 1);
}
