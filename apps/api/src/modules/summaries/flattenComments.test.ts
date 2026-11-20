import { describe, expect, it } from 'vitest';
import { type CommentNode, flattenComments } from './flattenComments.js';

const comment = (text: string | null, children: CommentNode[] = []): CommentNode => ({
  text,
  children,
});

// One token per character keeps the budget arithmetic readable.
const tokensOf = (text: string) => text.length;
const NO_LIMIT = { maxTokens: Infinity, tokensOf };

describe('flattenComments', () => {
  it('orders comments breadth-first across two trees, alternating between them at each depth', () => {
    const hn = [comment('hn 1', [comment('hn 1.1', [comment('hn 1.1.1')])]), comment('hn 2')];
    const devto = [comment('devto 1', [comment('devto 1.1')])];

    expect(flattenComments([hn, devto], NO_LIMIT)).toEqual([
      'hn 1',
      'devto 1',
      'hn 2',
      'hn 1.1',
      'devto 1.1',
      'hn 1.1.1',
    ]);
  });

  it('drops deleted and empty comments but keeps their replies', () => {
    const tree = [
      comment(null, [comment('reply to a deleted comment')]),
      comment('   '),
      comment('kept'),
    ];

    expect(flattenComments([tree], NO_LIMIT)).toEqual(['kept', 'reply to a deleted comment']);
  });

  it('keeps comments while they fit in the token budget and skips one that does not', () => {
    const tree = [comment('a'.repeat(8)), comment('b'.repeat(40)), comment('c'.repeat(8))];

    expect(flattenComments([tree], { maxTokens: 20, tokensOf })).toEqual(['a'.repeat(8), 'c'.repeat(8)]);
    expect(flattenComments([tree], { maxTokens: 14, tokensOf })).toEqual(['a'.repeat(8)]);
  });

  it('counts each comment with the given cost function at its position in the result', () => {
    const tree = [comment(null), comment('one'), comment('two'), comment('three')];
    const positions: number[] = [];

    const kept = flattenComments([tree], {
      maxTokens: 25,
      tokensOf: (_text, position) => {
        positions.push(position);
        return 10;
      },
    });

    // The count of kept comments is what the prompt says the summary is based on.
    expect(kept).toHaveLength(2);
    expect(positions).toEqual([0, 1, 2]);
  });
});
