const MAX_BASE_LENGTH = 60;

// Letters NFKD can't decompose into an ASCII base plus a mark.
const TRANSLITERATIONS: Record<string, string> = {
  ß: 'ss',
  ẞ: 'ss',
  ø: 'o',
  Ø: 'O',
  æ: 'ae',
  Æ: 'AE',
  œ: 'oe',
  Œ: 'OE',
  ł: 'l',
  Ł: 'L',
  đ: 'd',
  Đ: 'D',
  þ: 'th',
  Þ: 'TH',
};
const TRANSLITERATION_PATTERN = new RegExp(`[${Object.keys(TRANSLITERATIONS).join('')}]`, 'g');

/** A stable 6-character base-36 hash (FNV-1a) of the name, so names with no ASCII word get distinct slugs. */
function nameHash(name: string) {
  let hash = 0x811c9dc5;
  for (const char of name.normalize('NFKC').trim()) {
    hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 0x01000193) >>> 0;
  }
  return (hash % 36 ** 6).toString(36).padStart(6, '0');
}

function baseSlug(name: string) {
  const words = name
    .replace(TRANSLITERATION_PATTERN, (letter) => TRANSLITERATIONS[letter] ?? letter)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .match(/[a-z0-9]+/g);
  const slug = (words?.join('-') ?? '').slice(0, MAX_BASE_LENGTH).replace(/-$/, '');
  // A name of emoji or non-Latin letters has no ASCII word left.
  return slug || `collection-${nameHash(name)}`;
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
