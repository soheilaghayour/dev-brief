import { describe, expect, it } from 'vitest';
import { sharedRunFinder, normalisedWords, SUMMARY_MAX_SHARED_WORDS } from './sharedRun.js';

const longestSharedRun = (output: string, sources: readonly string[], title = '') =>
  sharedRunFinder(sources, title)(output);

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
    expect(normalisedWords('Amiga‘s ʼtag` list')).toEqual(['amigas', 'tag', 'list']);
  });

  it('joins . _ / @ and - between letters or digits into one token, but splits them at a word edge', () => {
    expect(normalisedWords('Next.js 16.0.1 on 2026-11-21')).toEqual([
      'nextjs',
      '1601',
      'on',
      '20261121',
    ]);
    expect(normalisedWords('a_b/c@d-e')).toEqual(['abcde']);
    expect(normalisedWords('end. -- start - (x)')).toEqual(['end', 'start', 'x']);
  });

  it('applies NFKC, drops invisible characters and lowercases İ without splitting it', () => {
    expect(normalisedWords('ﬁne ＡＢＣ')).toEqual(['fine', 'abc']);
    expect(normalisedWords('co\u00ADoper\u200Bate zero\u200Dwidth')).toEqual([
      'cooperate',
      'zerowidth',
    ]);
    expect(normalisedWords('İstanbul')).toEqual(['istanbul']);
  });

  it('leaves a run of CJK characters as one token', () => {
    expect(normalisedWords('日本語のテキスト です')).toEqual(['日本語のテキスト', 'です']);
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

  it('AC-2.3.10 lets shared version strings and dotted names count as one word each', () => {
    expect(longestSharedRun('Next.js 16.0.1 ships today', ['Next.js 16.0.1 ships today'])).toBe(4);
    const comment = 'TypeScript 5.7.2 and Node.js 22.11.0 now ship together';
    const output = 'Upgrading to TypeScript 5.7.2 and Node.js 22.11.0 fixed it';
    expect(longestSharedRun(output, [comment])).toBeLessThanOrEqual(SUMMARY_MAX_SHARED_WORDS);
    expect(
      longestSharedRun('released on 2026-11-21 in Berlin', ['released on 2026-11-21 in Berlin']),
    ).toBe(5);
  });

  it('AC-2.3.10 still fails a real copied passage of 8 words', () => {
    const passage = 'the macro trick is clever but it breaks';
    expect(longestSharedRun(`They say ${passage} often`, [`Intro. ${passage} soon.`])).toBe(8);
  });

  it('AC-2.3.10 ignores words that restate a title of more than 7 words, and only those', () => {
    const title = 'Designated initializers give C callers named arguments without new syntax';
    const source = `${title} and then a few further words follow here`;
    expect(longestSharedRun(title, [source], title)).toBe(0);
    expect(longestSharedRun(title, [source])).toBe(10);
    expect(longestSharedRun(`${title} and then a few further words`, [source], title)).toBe(6);
  });

  it('is 0 for no sources, no output or nothing shared', () => {
    expect(longestSharedRun('anything at all', [])).toBe(0);
    expect(longestSharedRun('', [SOURCE])).toBe(0);
    expect(longestSharedRun('alpha beta gamma', [SOURCE])).toBe(0);
    expect(longestSharedRun('!!! ---', ['!!! ---'])).toBe(0);
  });
});
