import { describe, expect, it } from 'vitest';
import { longestSharedRun, normalisedWords, SUMMARY_MAX_SHARED_WORDS } from './sharedRun.js';

const SOURCE = 'one two three four five six seven eight nine ten eleven twelve';

describe('normalisedWords', () => {
  it('lowercases, turns punctuation and runs of whitespace into single separators, and keeps apostrophes inside a word', () => {
    expect(normalisedWords("  It's  FAST,\n\tnot slow -- really!  ")).toEqual([
      'its',
      'fast',
      'not',
      'slow',
      'really',
    ]);
    expect(normalisedWords('Amiga’s "tag list"')).toEqual(['amigas', 'tag', 'list']);
    expect(normalisedWords('Node.js/Deno v1.2.3')).toEqual(['node', 'js', 'deno', 'v1', '2', '3']);
  });

  it('keeps letters and digits of any script', () => {
    expect(normalisedWords('Größe 日本語 42')).toEqual(['größe', '日本語', '42']);
  });
});

describe('longestSharedRun', () => {
  it('AC-2.3.10 lets 7 shared words pass and fails 8', () => {
    const seven = 'one two three four five six seven';
    expect(longestSharedRun(`Mixed: ${seven}, then more.`, [SOURCE])).toBe(7);
    expect(longestSharedRun(`Mixed: ${seven} eight, then more.`, [SOURCE])).toBe(8);
    expect(SUMMARY_MAX_SHARED_WORDS).toBe(7);
  });

  it('AC-2.3.10 ignores case, punctuation and whitespace', () => {
    const shouted = 'ONE, two; "three" four\n\nfive -- six (seven) EIGHT!';
    expect(longestSharedRun(shouted, [SOURCE])).toBe(8);
  });

  it('AC-2.3.10 counts a run split across two input comments only when it is contiguous in the input', () => {
    const output = 'one two three four five six seven eight';
    const firstComment = 'prefix words one two three four';
    const secondComment = 'five six seven eight suffix words';
    expect(longestSharedRun(output, [firstComment, secondComment])).toBe(4);
    expect(longestSharedRun(output, ['one two three four five six seven eight nine'])).toBe(8);
  });

  it('AC-2.3.10 finds the run anywhere in the output and in any one source', () => {
    const output = 'Commenters say that nine ten eleven twelve one two three four are all fine';
    expect(longestSharedRun(output, ['unrelated', SOURCE])).toBe(4);
    expect(longestSharedRun('x seven eight nine ten eleven twelve', [SOURCE])).toBe(6);
  });

  it('AC-2.3.10 treats a near miss as a different phrase: a changed, added, dropped or moved word breaks the run', () => {
    expect(longestSharedRun('one two three four FIVEISH six seven eight', [SOURCE])).toBe(4);
    expect(longestSharedRun('one two three four five really six seven eight', [SOURCE])).toBe(5);
    expect(longestSharedRun('one two three four five six eight', [SOURCE])).toBe(6);
    expect(longestSharedRun('two one three four five six seven eight', [SOURCE])).toBe(6);
  });

  it('AC-2.3.10 counts a repeated word by position, not as a long run', () => {
    expect(longestSharedRun('one one one one one one one one one', ['one two one one'])).toBe(2);
  });

  it('is 0 for no sources, no output or nothing shared', () => {
    expect(longestSharedRun('anything at all', [])).toBe(0);
    expect(longestSharedRun('', [SOURCE])).toBe(0);
    expect(longestSharedRun('alpha beta gamma', [SOURCE])).toBe(0);
    expect(longestSharedRun('!!! ---', ['!!! ---'])).toBe(0);
  });
});
