import { describe, expect, it } from 'vitest';
import { findMatchRanges, foldAsciiCase, splitSearchPieces } from './searchMatch.js';

describe('splitSearchPieces', () => {
  it('AC-1.3.4 trims and splits on whitespace', () => {
    expect(splitSearchPieces('  angu \t react\n')).toEqual(['angu', 'react']);
  });

  it('AC-1.3.4 keeps punctuation inside a piece', () => {
    expect(splitSearchPieces('c++ node.js "bun -x')).toEqual(['c++', 'node.js', '"bun', '-x']);
  });

  it('AC-1.3.4 returns each distinct piece once, in first-seen order', () => {
    expect(splitSearchPieces('a a a')).toEqual(['a']);
    expect(splitSearchPieces('react angu react A')).toEqual(['react', 'angu', 'A']);
  });

  it('AC-1.3.4 gives no pieces for empty or blank text', () => {
    expect(splitSearchPieces('')).toEqual([]);
    expect(splitSearchPieces('   ')).toEqual([]);
  });
});

describe('foldAsciiCase', () => {
  it('AC-1.3.4 folds A-Z only and keeps the length', () => {
    expect(foldAsciiCase('ABC xyz ÉCOLE İ')).toBe('abc xyz École İ');
    expect(foldAsciiCase('İSTANBUL')).toHaveLength('İSTANBUL'.length);
  });
});

describe('findMatchRanges', () => {
  it('AC-1.3.4 finds a piece anywhere in a word, ignoring A-Z case', () => {
    expect(findMatchRanges('Angular 21 is out', ['angu'])).toEqual([{ start: 0, end: 4 }]);
    expect(findMatchRanges('Angular 21 is out', ['GULAR'])).toEqual([{ start: 2, end: 7 }]);
  });

  it('AC-1.3.4 finds every occurrence of every piece', () => {
    expect(findMatchRanges('AI agents in main', ['ai'])).toEqual([
      { start: 0, end: 2 },
      { start: 14, end: 16 },
    ]);
  });

  it('AC-1.3.4 merges overlapping and touching ranges', () => {
    expect(findMatchRanges('JavaScript', ['java', 'vasc'])).toEqual([{ start: 0, end: 6 }]);
    expect(findMatchRanges('JavaScript', ['java', 'script'])).toEqual([{ start: 0, end: 10 }]);
    expect(findMatchRanges('aaa', ['aa'])).toEqual([{ start: 0, end: 3 }]);
  });

  it('AC-1.3.4 returns ranges sorted by start whatever the piece order', () => {
    expect(findMatchRanges('react and angular', ['angu', 'react'])).toEqual([
      { start: 0, end: 5 },
      { start: 10, end: 14 },
    ]);
  });

  it('AC-1.3.4 treats punctuation as plain characters', () => {
    expect(findMatchRanges('Why C++ and node.js? a-b', ['c++', 'node.js', 'a_b'])).toEqual([
      { start: 4, end: 7 },
      { start: 12, end: 19 },
    ]);
    expect(findMatchRanges('1000 stars', ['100%'])).toEqual([]);
  });

  it('AC-1.3.4 does not fold non-ASCII letters, and keeps offsets on the original text', () => {
    expect(findMatchRanges('ÉCOLE école', ['école'])).toEqual([{ start: 6, end: 11 }]);
    expect(findMatchRanges('İstanbul', ['i'])).toEqual([]);
    expect(findMatchRanges('İstanbul ISTANBUL', ['istanbul'])).toEqual([{ start: 9, end: 17 }]);
  });

  it('AC-1.3.4 does not match word forms', () => {
    expect(findMatchRanges('one database', ['databases'])).toEqual([]);
  });

  it('AC-1.3.4 returns nothing for no pieces or an empty text', () => {
    expect(findMatchRanges('text', [])).toEqual([]);
    expect(findMatchRanges('', ['a'])).toEqual([]);
  });
});
