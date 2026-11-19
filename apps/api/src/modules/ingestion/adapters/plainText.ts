export const EXCERPT_MAX_LENGTH = 500;

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' } as const;

const TAG_PATTERN = /<[^>]*>/g;

function decodeEntities(text: string) {
  // One pass, so "&amp;lt;" decodes to "&lt;" and not on to "<".
  return text.replace(
    /&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi,
    (match, decimal?: string, hex?: string, name?: string) => {
      if (name !== undefined) {
        return NAMED_ENTITIES[name.toLowerCase() as keyof typeof NAMED_ENTITIES] ?? match;
      }
      const codePoint = decimal !== undefined ? Number(decimal) : parseInt(hex ?? '', 16);
      return codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
    },
  );
}

/** Turns upstream HTML into plain text: no tags (also after decoding entities), single spaces, at most `maxLength` characters. */
export function toPlainText(html: string, maxLength = Infinity) {
  const withoutTags = html
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(TAG_PATTERN, ' ');
  // Decoding can reveal escaped markup ("&lt;b&gt;"), which must not reach the page as a tag either.
  const text = decodeEntities(withoutTags).replace(TAG_PATTERN, ' ').replace(/\s+/g, ' ').trim();
  const characters = [...text];
  return characters.length > maxLength ? `${characters.slice(0, maxLength - 1).join('')}…` : text;
}
