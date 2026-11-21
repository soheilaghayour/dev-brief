import { createHash } from 'node:crypto';

/** NFKC, lowercase, trimmed, whitespace collapsed, trailing sentence-ending marks dropped: the form two questions are compared in. */
export function normalizeQuestion(question: string) {
  return (
    question
      .normalize('NFKC')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      // Only sentence-enders: `#`, `)` and `+` end real tag names ("C#", "Rust (2024)"), so they must keep distinguishing keys.
      .replace(/[?!.…,;:\s]+$/u, '')
  );
}

/** The sha256 of the normalised question, the key of the 24 h cache. */
export function questionHash(question: string) {
  return createHash('sha256').update(normalizeQuestion(question)).digest('hex');
}
