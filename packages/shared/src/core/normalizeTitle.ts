const HN_PREFIX = /^\s*(?:show|ask)\s+hn\s*[:\-–—]\s*/;

/** Reduces a title to lowercase words separated by single spaces, so equal titles compare equal. */
export function normalizeTitle(title: string) {
  return title
    .toLowerCase()
    .replace(HN_PREFIX, '')
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
