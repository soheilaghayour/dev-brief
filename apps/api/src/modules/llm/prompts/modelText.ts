import type { z } from 'zod';

// PRD §8.2: no URLs (a scheme, `www.`, or a common-TLD domain with a path, so "Node.js/Deno" stays text) and no tags (`<` then a letter or `/`).
const URL_PATTERNS = [
  /https?:\/\//i,
  /\bwww\./i,
  /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|io|dev|app|ai|co|me|sh|ly|gg|xyz|info|so|tech|blog|site|page|us|uk|de|eu)\/\S/i,
];
const MARKUP_PATTERN = /<[a-z/]/i;

export const isPlainText = (text: string) =>
  !URL_PATTERNS.some((pattern) => pattern.test(text)) && !MARKUP_PATTERN.test(text);

/** One model-written string: within its contract length, with no URL and no markup. */
export function modelText(contractString: z.ZodString) {
  return contractString.refine(isPlainText, 'must not contain a URL or markup');
}
