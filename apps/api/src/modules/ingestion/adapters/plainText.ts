import { decodeHTML } from 'entities';

export const EXCERPT_MAX_LENGTH = 500;

// A tag starts with a letter, "/" or "!": "a < b" and "x<5" are text.
const TAG_PATTERN = /<\/?[a-z!][^>]*>/gi;

/** Turns upstream HTML into plain text: no tags (also after decoding entities), single spaces, at most `maxLength` characters. */
export function toPlainText(html: string, maxLength = Infinity) {
  const withoutTags = html
    .replace(/<(script|style)\b[\s\S]*?(?:<\/\1\s*>|$)/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(TAG_PATTERN, ' ');
  // Decoding can reveal escaped markup ("&lt;b&gt;"), which must not reach the page as a tag either.
  const text = decodeHTML(withoutTags).replace(TAG_PATTERN, ' ').replace(/\s+/g, ' ').trim();
  const characters = [...text];
  return characters.length > maxLength ? `${characters.slice(0, maxLength - 1).join('')}…` : text;
}
