import { createHash } from 'node:crypto';

/** NFKC, lowercase, trimmed, whitespace collapsed, trailing punctuation dropped: the form two questions are compared in. */
export function normalizeQuestion(question: string) {
  return question
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\p{P}\s]+$/u, '');
}

/** The sha256 of the normalised question, the key of the 24 h cache. */
export function questionHash(question: string) {
  return createHash('sha256').update(normalizeQuestion(question)).digest('hex');
}
