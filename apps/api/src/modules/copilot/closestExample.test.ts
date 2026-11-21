import { EXAMPLE_QUESTIONS } from '@devbrief/shared';
import { describe, expect, it } from 'vitest';
import { closestExample } from './closestExample.js';

const EXAMPLES = EXAMPLE_QUESTIONS.map(({ slug, question }, position) => ({
  slug,
  question,
  position,
}));

describe('closestExample', () => {
  it('AC-3.1.5 picks the example that shares the most tags with the question', () => {
    expect(closestExample('Is Rust still worth learning?', EXAMPLES)?.slug).toBe('rust-vs-go');
    expect(closestExample('TypeScript compiler speed', EXAMPLES)?.slug).toBe('ts-tooling-debates');
  });

  it('prefers the example with more shared tags over one with fewer', () => {
    const examples = [
      { slug: 'rust-only', question: 'Rust news', position: 0 },
      { slug: 'both', question: 'TypeScript and Rust news', position: 1 },
    ];
    expect(closestExample('Rust and TypeScript', examples)?.slug).toBe('both');
  });

  it('breaks ties by position, whatever the order of the rows', () => {
    const shuffled = [EXAMPLES[2]!, EXAMPLES[0]!, EXAMPLES[1]!];
    expect(closestExample('knitting patterns', shuffled)?.slug).toBe('ts-tooling-debates');
  });

  it('returns nothing without examples', () => {
    expect(closestExample('typescript', [])).toBeUndefined();
  });
});
