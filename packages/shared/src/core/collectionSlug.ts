const FALLBACK_SLUG = 'collection';
const MAX_BASE_LENGTH = 60;

function baseSlug(name: string) {
  const words = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .match(/[a-z0-9]+/g);
  // A name of emoji or non-Latin letters has no ASCII word left.
  const slug = (words?.join('-') ?? '').slice(0, MAX_BASE_LENGTH).replace(/-$/, '');
  return slug || FALLBACK_SLUG;
}

/** Turns a collection name into a lowercase ASCII slug, with `-2`, `-3` … appended while `takenSlugs` holds it. */
export function collectionSlug(name: string, takenSlugs: Iterable<string>): string {
  const taken = new Set(takenSlugs);
  const base = baseSlug(name);
  if (!taken.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}
