import { describe, expect, it } from 'vitest';
import { normalizeQuestion, questionHash } from './normalizeQuestion.js';

describe('normalizeQuestion', () => {
  it('AC-3.1.3 lowercases, trims, collapses whitespace and drops trailing punctuation', () => {
    expect(normalizeQuestion("  What were THIS week's TypeScript\ttooling   debates?? ")).toBe(
      "what were this week's typescript tooling debates",
    );
  });

  it('applies Unicode NFKC, so full-width and compatibility forms compare equal', () => {
    expect(normalizeQuestion('ＴypeScript ｔｏｏｌｓ？')).toBe('typescript tools');
    expect(normalizeQuestion('ﬁle formats')).toBe('file formats');
  });

  it('keeps inner punctuation and only drops it at the end', () => {
    expect(normalizeQuestion('Rust vs. Go: which one?!...')).toBe('rust vs. go: which one');
  });

  it('hashes equal normalised questions equally and different questions differently', () => {
    expect(questionHash('  What is NEW in Rust?? ')).toBe(questionHash('what is new in rust'));
    expect(questionHash('what is new in rust')).not.toBe(questionHash('what is new in go'));
    expect(questionHash('x')).toMatch(/^[0-9a-f]{64}$/);
  });
});
